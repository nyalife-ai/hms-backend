/**
 * Prisma pharmacy repository — thin alias over pharmacy.medications.
 * Dispense flows belong to DispenseMedicationUseCase.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import type { PharmacyQueryDto } from '../../dto';
import { Pharmacy } from '../../domain/pharmacy.entity';
import { PharmacyName } from '../../domain/value-objects/pharmacy-name.vo';
import type {
  IPharmacyRepository,
  PharmacyPage,
} from '../../interfaces/pharmacy-repository.interface';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class PrismaPharmacyRepository implements IPharmacyRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async save(entity: Pharmacy): Promise<Pharmacy> {
    const name = entity.getName().getValue();
    const id = entity.getId();
    const existing =
      UUID_RE.test(id)
        ? await this.prisma.medications.findFirst({
            where: { id, deleted_at: null },
          })
        : null;

    if (existing) {
      const row = await this.prisma.medications.update({
        where: { id },
        data: {
          medication_name: name,
          description: entity.getDescription() ?? null,
        },
      });
      return this.toDomain(row);
    }

    const row = await this.prisma.medications.create({
      data: {
        medication_name: name,
        description: entity.getDescription() ?? null,
        is_active: true,
      },
    });
    return this.toDomain(row);
  }

  public async delete(id: string): Promise<void> {
    await this.softDelete(id);
  }

  public async findById(id: string): Promise<Pharmacy | null> {
    const row = await this.prisma.medications.findFirst({
      where: { id, deleted_at: null },
    });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Pharmacy[]> {
    const rows = await this.prisma.medications.findMany({
      where: { deleted_at: null, is_active: true },
      orderBy: { medication_name: 'asc' },
      take: 500,
    });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (
      (await this.prisma.medications.count({
        where: { id, deleted_at: null },
      })) > 0
    );
  }

  public async findMany(query: PharmacyQueryDto): Promise<PharmacyPage> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const where = { deleted_at: null as null };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.medications.count({ where }),
      this.prisma.medications.findMany({
        where,
        skip,
        take: limit,
        orderBy: { medication_name: 'asc' },
      }),
    ]);
    return { items: rows.map((r) => this.toDomain(r)), total };
  }

  public async softDelete(id: string): Promise<void> {
    await this.prisma.medications.update({
      where: { id },
      data: { deleted_at: new Date(), is_active: false },
    });
  }

  protected toDomain(row: {
    id: string;
    medication_name: string;
    description: string | null;
    created_at: Date;
    updated_at: Date;
  }): Pharmacy {
    return Pharmacy.reconstitute(
      row.id,
      {
        name: PharmacyName.create(row.medication_name),
        description: row.description ?? undefined,
      },
      row.created_at,
      row.updated_at,
    );
  }
}
