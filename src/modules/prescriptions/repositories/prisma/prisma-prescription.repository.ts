/**
 * Prisma prescription repository — pharmacy.prescriptions (db.sql).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import type { PrescriptionsQueryDto } from '../../dto';
import { Prescription } from '../../domain/prescription.entity';
import { PrescriptionName } from '../../domain/value-objects/prescription-name.vo';
import type {
  IPrescriptionRepository,
  PrescriptionPage,
} from '../../interfaces/prescription-repository.interface';

@Injectable()
export class PrismaPrescriptionRepository implements IPrescriptionRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async save(entity: Prescription): Promise<Prescription> {
    const existing = await this.prisma.prescriptions.findFirst({
      where: { id: entity.getId(), deleted_at: null },
    });

    const prescriptionNumber = entity.getName().getValue().slice(0, 64);

    if (existing) {
      const row = await this.prisma.prescriptions.update({
        where: { id: entity.getId() },
        data: {
          consultation_id: entity.getConsultationId() ?? null,
          prescription_number: prescriptionNumber,
          status: entity.getStatus(),
          notes: entity.getDescription() ?? null,
          is_voided: entity.getIsVoided(),
        },
      });
      return this.toDomain(row);
    }

    const row = await this.prisma.prescriptions.create({
      data: {
        patient_id: entity.getPatientId(),
        consultation_id: entity.getConsultationId() ?? null,
        prescription_number: prescriptionNumber,
        prescribed_by: entity.getPrescribedBy(),
        status: entity.getStatus(),
        notes: entity.getDescription() ?? null,
        is_voided: false,
      },
    });
    return this.toDomain(row);
  }

  public async delete(id: string): Promise<void> {
    await this.softDelete(id);
  }

  public async findById(id: string): Promise<Prescription | null> {
    const row = await this.prisma.prescriptions.findFirst({
      where: { id, deleted_at: null },
    });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Prescription[]> {
    const rows = await this.prisma.prescriptions.findMany({
      where: { deleted_at: null },
      orderBy: { prescription_date: 'desc' },
      take: 500,
    });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (
      (await this.prisma.prescriptions.count({
        where: { id, deleted_at: null },
      })) > 0
    );
  }

  public async findMany(
    query: PrescriptionsQueryDto,
  ): Promise<PrescriptionPage> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const where = {
      deleted_at: null,
      ...(query.search
        ? {
            OR: [
              {
                prescription_number: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                notes: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                status: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.prescriptions.count({ where }),
      this.prisma.prescriptions.findMany({
        where,
        skip,
        take: limit,
        orderBy: { prescription_date: 'desc' },
      }),
    ]);
    return { items: rows.map((r) => this.toDomain(r)), total };
  }

  public async softDelete(id: string): Promise<void> {
    await this.prisma.prescriptions.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  protected toDomain(row: {
    id: string;
    patient_id: string;
    consultation_id: string | null;
    prescription_number: string | null;
    prescribed_by: string;
    status: string;
    notes: string | null;
    is_voided: boolean;
    created_at: Date;
    updated_at: Date;
  }): Prescription {
    const label =
      row.prescription_number?.trim() ||
      row.notes?.trim() ||
      `RX-${row.id.slice(0, 8)}`;
    return Prescription.reconstitute(
      row.id,
      {
        name: PrescriptionName.create(label.slice(0, 255)),
        description: row.notes ?? undefined,
        patientId: row.patient_id,
        prescribedBy: row.prescribed_by,
        consultationId: row.consultation_id,
        status: row.status,
        isVoided: row.is_voided,
      },
      row.created_at,
      row.updated_at,
    );
  }
}
