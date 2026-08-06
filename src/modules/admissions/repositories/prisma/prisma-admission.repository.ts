/**
 * Prisma admission repository — inpatient.admissions (read + soft status cancel).
 * Creates/transfers/discharges belong to IpdJourneyUseCase (/ipd).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import type { AdmissionsQueryDto } from '../../dto';
import { Admission } from '../../domain/admission.entity';
import { AdmissionName } from '../../domain/value-objects/admission-name.vo';
import type {
  IAdmissionRepository,
  AdmissionPage,
} from '../../interfaces/admission-repository.interface';

@Injectable()
export class PrismaAdmissionRepository implements IAdmissionRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async save(_entity: Admission): Promise<Admission> {
    throw new Error(
      'Use POST /ipd/admissions (IpdJourneyUseCase) for admit/transfer/discharge',
    );
  }

  public async delete(id: string): Promise<void> {
    await this.softDelete(id);
  }

  public async findById(id: string): Promise<Admission | null> {
    const row = await this.prisma.admissions.findFirst({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Admission[]> {
    const rows = await this.prisma.admissions.findMany({
      where: { status: 'ADMITTED' },
      orderBy: { admission_date: 'desc' },
      take: 200,
    });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (await this.prisma.admissions.count({ where: { id } })) > 0;
  }

  public async findMany(query: AdmissionsQueryDto): Promise<AdmissionPage> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const where = {
      ...(query.search
        ? {
            OR: [
              {
                primary_diagnosis: {
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
      this.prisma.admissions.count({ where }),
      this.prisma.admissions.findMany({
        where,
        skip,
        take: limit,
        orderBy: { admission_date: 'desc' },
      }),
    ]);
    return { items: rows.map((r) => this.toDomain(r)), total };
  }

  public async softDelete(_id: string): Promise<void> {
    throw new Error('Use POST /ipd/admissions/:id/discharge to end an admission');
  }

  protected toDomain(row: {
    id: string;
    patient_id: string;
    primary_diagnosis: string | null;
    status: string;
    created_at: Date;
    updated_at: Date;
  }): Admission {
    const label = row.primary_diagnosis?.trim() || `Admission ${row.patient_id}`;
    return Admission.reconstitute(
      row.id,
      {
        name: AdmissionName.create(label.slice(0, 255) || 'Admission'),
        description: row.status,
      },
      row.created_at,
      row.updated_at,
    );
  }
}
