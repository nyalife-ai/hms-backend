/**
 * Prisma inpatient repository — inpatient.admissions (read).
 * Admit/transfer/discharge belong to IpdJourneyUseCase (/ipd).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import type { InpatientQueryDto } from '../../dto';
import { Inpatient } from '../../domain/inpatient.entity';
import { InpatientName } from '../../domain/value-objects/inpatient-name.vo';
import type {
  IInpatientRepository,
  InpatientPage,
} from '../../interfaces/inpatient-repository.interface';

@Injectable()
export class PrismaInpatientRepository implements IInpatientRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async save(_entity: Inpatient): Promise<Inpatient> {
    throw new Error(
      'Use POST /ipd/admissions (IpdJourneyUseCase) for admit/transfer/discharge',
    );
  }

  public async delete(id: string): Promise<void> {
    await this.softDelete(id);
  }

  public async findById(id: string): Promise<Inpatient | null> {
    const row = await this.prisma.admissions.findFirst({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Inpatient[]> {
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

  public async findMany(query: InpatientQueryDto): Promise<InpatientPage> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.admissions.count(),
      this.prisma.admissions.findMany({
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
  }): Inpatient {
    const label =
      row.primary_diagnosis?.trim() || `Admission ${row.patient_id}`;
    return Inpatient.reconstitute(
      row.id,
      {
        name: InpatientName.create(label.slice(0, 255) || 'Admission'),
        description: row.status,
      },
      row.created_at,
      row.updated_at,
    );
  }
}
