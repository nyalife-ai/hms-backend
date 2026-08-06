/**
 * FEFO dispense with atomic stock decrement + stock_movements.
 * Uses conditional updateMany to prevent oversell races.
 * Skips expired batches. Visit dispense uses null reference_type
 * (db.sql CHECK does not allow VISIT) and records visit id in notes.
 */

import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../database/prisma/prisma.service';

export type DispenseLine = {
  medication: string;
  medicationId?: string;
  quantity?: number;
};

export const PHARMACY_EVENTS = {
  DISPENSED: 'pharmacy.medicine.dispensed',
} as const;

@Injectable()
export class DispenseMedicationUseCase {
  private readonly log = new Logger(DispenseMedicationUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async alreadyDispensed(visitId: string): Promise<boolean> {
    if (!this.prisma.isConnected) return false;
    const existing = await this.prisma.stockMovements.findFirst({
      where: {
        movement_type: 'DISPENSE',
        notes: { contains: `visit:${visitId}` },
      },
    });
    return Boolean(existing);
  }

  async dispenseForVisit(input: {
    visitId: string;
    lines: DispenseLine[];
    performedBy: string;
  }): Promise<{ dispensed: number; warnings: string[] }> {
    return this.execute(input);
  }

  async execute(input: {
    visitId: string;
    lines: DispenseLine[];
    performedBy: string;
  }): Promise<{ dispensed: number; warnings: string[] }> {
    if (!this.prisma.isConnected || !input.lines.length) {
      return { dispensed: 0, warnings: [] };
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.stockMovements.findFirst({
        where: {
          movement_type: 'DISPENSE',
          notes: { contains: `visit:${input.visitId}` },
        },
      });
      if (existing) {
        return { dispensed: 0, warnings: [] };
      }

      const warnings: string[] = [];
      let dispensed = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const needles = input.lines
        .filter((l) => !l.medicationId && l.medication?.trim())
        .map((l) => l.medication.trim().toLowerCase());
      const meds =
        needles.length > 0
          ? await tx.medications.findMany({
              where: { is_active: true, deleted_at: null },
              select: {
                id: true,
                medication_name: true,
                generic_name: true,
              },
              take: 500,
            })
          : [];

      for (const line of input.lines) {
        const qty = Math.max(1, Number(line.quantity) || 1);
        let medicationId = line.medicationId;

        if (!medicationId && line.medication?.trim()) {
          const needle = line.medication.trim().toLowerCase();
          const med = meds.find(
            (m) =>
              m.medication_name.toLowerCase() === needle ||
              (m.generic_name || '').toLowerCase() === needle,
          );
          medicationId = med?.id;
        }

        if (!medicationId) {
          warnings.push(
            `No formulary match for "${line.medication}" — stock not reduced.`,
          );
          continue;
        }

        let remaining = qty;
        const batches = await tx.batches.findMany({
          where: {
            medication_id: medicationId,
            quantity_on_hand: { gt: 0 },
            expiry_date: { gte: today },
          },
          orderBy: { expiry_date: 'asc' },
        });

        if (!batches.length) {
          warnings.push(
            `No usable (non-expired) stock for "${line.medication}".`,
          );
          continue;
        }

        for (const batch of batches) {
          if (remaining <= 0) break;
          const onHand = Number(batch.quantity_on_hand);
          const take = Math.min(onHand, remaining);
          if (take <= 0) continue;

          const updated = await tx.batches.updateMany({
            where: {
              id: batch.id,
              quantity_on_hand: { gte: take },
            },
            data: {
              quantity_on_hand: { decrement: take },
            },
          });
          if (updated.count !== 1) {
            warnings.push(
              `Concurrent stock change for batch ${batch.batch_number} — retry needed.`,
            );
            continue;
          }

          await tx.stockMovements.create({
            data: {
              batch_id: batch.id,
              movement_type: 'DISPENSE',
              quantity_change: -take,
              reference_type: null,
              reference_id: null,
              notes: `visit:${input.visitId} · Dispensed · ${line.medication}`,
              performed_by: input.performedBy,
            },
          });
          remaining -= take;
          dispensed += take;
        }

        if (remaining > 0) {
          warnings.push(
            `Partial stock for "${line.medication}" — short ${remaining} unit(s).`,
          );
        }
      }

      if (warnings.length) {
        this.log.warn(`Visit ${input.visitId}: ${warnings.join(' | ')}`);
      }

      if (dispensed > 0) {
        this.events.emit(PHARMACY_EVENTS.DISPENSED, {
          visitId: input.visitId,
          dispensed,
        });
      }

      return { dispensed, warnings };
    });
  }
}
