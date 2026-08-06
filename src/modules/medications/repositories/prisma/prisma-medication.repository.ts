/**
 * Prisma medication repository — pharmacy.medications.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import type { MedicationsQueryDto } from '../../dto';
import { Medication } from '../../domain/medication.entity';
import { MedicationName } from '../../domain/value-objects/medication-name.vo';
import type {
  IMedicationRepository,
  MedicationPage,
} from '../../interfaces/medication-repository.interface';

@Injectable()
export class PrismaMedicationRepository implements IMedicationRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async save(entity: Medication): Promise<Medication> {
    const name = entity.getName().getValue();
    const existing = await this.prisma.medications.findFirst({
      where: { id: entity.getId(), deleted_at: null },
    });

    if (existing) {
      const row = await this.prisma.medications.update({
        where: { id: entity.getId() },
        data: {
          medication_name: name,
          generic_name: entity.getGenericName() ?? null,
          form: entity.getForm() ?? null,
          strength: entity.getStrength() ?? null,
          unit: entity.getUnit() ?? null,
          standard_selling_price: entity.getStandardSellingPrice(),
          description: entity.getDescription() ?? null,
          is_active: entity.getIsActive(),
        },
      });
      return this.toDomain(row);
    }

    const row = await this.prisma.medications.create({
      data: {
        medication_name: name,
        generic_name: entity.getGenericName() ?? null,
        form: entity.getForm() ?? null,
        strength: entity.getStrength() ?? null,
        unit: entity.getUnit() ?? null,
        standard_selling_price: entity.getStandardSellingPrice(),
        description: entity.getDescription() ?? null,
        is_active: true,
      },
    });
    return this.toDomain(row);
  }

  public async delete(id: string): Promise<void> {
    await this.softDelete(id);
  }

  public async findById(id: string): Promise<Medication | null> {
    const row = await this.prisma.medications.findFirst({
      where: { id, deleted_at: null },
    });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Medication[]> {
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

  public async findMany(query: MedicationsQueryDto): Promise<MedicationPage> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const where = {
      deleted_at: null,
      ...(query.search
        ? {
            OR: [
              {
                medication_name: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                generic_name: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };
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
    generic_name: string | null;
    form: string | null;
    strength: string | null;
    unit: string | null;
    standard_selling_price: { toNumber?: () => number } | number | string;
    description: string | null;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }): Medication {
    const price =
      typeof row.standard_selling_price === 'object' &&
      row.standard_selling_price?.toNumber
        ? row.standard_selling_price.toNumber()
        : Number(row.standard_selling_price);
    return Medication.reconstitute(
      row.id,
      {
        name: MedicationName.create(row.medication_name),
        genericName: row.generic_name,
        form: row.form,
        strength: row.strength,
        unit: row.unit,
        standardSellingPrice: price,
        isActive: row.is_active,
        description: row.description,
      },
      row.created_at,
      row.updated_at,
    );
  }
}
