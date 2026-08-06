/**
 * Prisma diagnos repository — clinical.diagnoses.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import type { DiagnosesQueryDto } from '../../dto';
import { Diagnos } from '../../domain/diagnos.entity';
import { DiagnosName } from '../../domain/value-objects/diagnos-name.vo';
import type {
  IDiagnosRepository,
  DiagnosPage,
} from '../../interfaces/diagnos-repository.interface';

@Injectable()
export class PrismaDiagnosRepository implements IDiagnosRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async save(entity: Diagnos): Promise<Diagnos> {
    const existing = await this.prisma.diagnoses.findFirst({
      where: { id: entity.getId() },
    });

    if (existing) {
      const row = await this.prisma.diagnoses.update({
        where: { id: entity.getId() },
        data: {
          description: entity.getDescription() ?? existing.description,
          icd10_code: entity.getIcd10Code() ?? null,
          diagnosis_type: entity.getDiagnosisType(),
          onset_date: entity.getOnsetDate() ?? null,
        },
      });
      return this.toDomain(row);
    }

    const row = await this.prisma.diagnoses.create({
      data: {
        consultation_id: entity.getConsultationId(),
        patient_id: entity.getPatientId(),
        description: entity.getDescription() ?? entity.getName().getValue(),
        icd10_code: entity.getIcd10Code() ?? null,
        diagnosis_type: entity.getDiagnosisType(),
        onset_date: entity.getOnsetDate() ?? null,
      },
    });
    return this.toDomain(row);
  }

  public async delete(id: string): Promise<void> {
    await this.softDelete(id);
  }

  public async findById(id: string): Promise<Diagnos | null> {
    const row = await this.prisma.diagnoses.findFirst({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Diagnos[]> {
    const rows = await this.prisma.diagnoses.findMany({
      orderBy: { created_at: 'desc' },
      take: 200,
    });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (await this.prisma.diagnoses.count({ where: { id } })) > 0;
  }

  public async findMany(query: DiagnosesQueryDto): Promise<DiagnosPage> {
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
                icd10_code: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.diagnoses.count({ where }),
      this.prisma.diagnoses.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
    ]);
    return { items: rows.map((r) => this.toDomain(r)), total };
  }

  public async softDelete(id: string): Promise<void> {
    await this.prisma.diagnoses.delete({ where: { id } });
  }

  protected toDomain(row: {
    id: string;
    consultation_id: string;
    patient_id: string;
    icd10_code: string | null;
    description: string;
    diagnosis_type: string;
    onset_date: Date | null;
    created_at: Date;
  }): Diagnos {
    const label =
      row.icd10_code?.trim() || row.description.slice(0, 255) || 'Diagnosis';
    return Diagnos.reconstitute(
      row.id,
      {
        name: DiagnosName.create(label),
        description: row.description,
        consultationId: row.consultation_id,
        patientId: row.patient_id,
        icd10Code: row.icd10_code,
        diagnosisType: row.diagnosis_type,
        onsetDate: row.onset_date,
      },
      row.created_at,
      row.created_at,
    );
  }
}
