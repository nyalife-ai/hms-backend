/**
 * Prisma procedure repository — clinical.procedures.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import type { ProceduresQueryDto } from '../../dto';
import { Procedure } from '../../domain/procedure.entity';
import { ProcedureName } from '../../domain/value-objects/procedure-name.vo';
import type {
  IProcedureRepository,
  ProcedurePage,
} from '../../interfaces/procedure-repository.interface';

@Injectable()
export class PrismaProcedureRepository implements IProcedureRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async save(entity: Procedure): Promise<Procedure> {
    const existing = await this.prisma.procedures.findFirst({
      where: { id: entity.getId() },
    });

    if (existing) {
      const row = await this.prisma.procedures.update({
        where: { id: entity.getId() },
        data: {
          description: entity.getDescription() ?? existing.description,
          cpt_code: entity.getCptCode() ?? null,
          performer_id: entity.getPerformerId() ?? null,
          outcome: entity.getOutcome() ?? null,
          performed_at: entity.getPerformedAt() ?? existing.performed_at,
        },
      });
      return this.toDomain(row);
    }

    const row = await this.prisma.procedures.create({
      data: {
        consultation_id: entity.getConsultationId(),
        patient_id: entity.getPatientId(),
        description: entity.getDescription() ?? entity.getName().getValue(),
        cpt_code: entity.getCptCode() ?? null,
        performer_id: entity.getPerformerId() ?? null,
        outcome: entity.getOutcome() ?? null,
        performed_at: entity.getPerformedAt() ?? undefined,
      },
    });
    return this.toDomain(row);
  }

  public async delete(id: string): Promise<void> {
    await this.softDelete(id);
  }

  public async findById(id: string): Promise<Procedure | null> {
    const row = await this.prisma.procedures.findFirst({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Procedure[]> {
    const rows = await this.prisma.procedures.findMany({
      orderBy: { created_at: 'desc' },
      take: 200,
    });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (await this.prisma.procedures.count({ where: { id } })) > 0;
  }

  public async findMany(query: ProceduresQueryDto): Promise<ProcedurePage> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const where = {
      ...(query.search
        ? {
            OR: [
              {
                description: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                cpt_code: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.procedures.count({ where }),
      this.prisma.procedures.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
    ]);
    return { items: rows.map((r) => this.toDomain(r)), total };
  }

  public async softDelete(id: string): Promise<void> {
    await this.prisma.procedures.delete({ where: { id } });
  }

  protected toDomain(row: {
    id: string;
    consultation_id: string;
    patient_id: string;
    cpt_code: string | null;
    description: string;
    performer_id: string | null;
    outcome: string | null;
    performed_at: Date;
    created_at: Date;
  }): Procedure {
    const label =
      row.cpt_code?.trim() || row.description.slice(0, 255) || 'Procedure';
    return Procedure.reconstitute(
      row.id,
      {
        name: ProcedureName.create(label),
        description: row.description,
        consultationId: row.consultation_id,
        patientId: row.patient_id,
        cptCode: row.cpt_code,
        performerId: row.performer_id,
        outcome: row.outcome,
        performedAt: row.performed_at,
      },
      row.created_at,
      row.created_at,
    );
  }
}
