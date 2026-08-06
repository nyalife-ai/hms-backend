/**
 * Prisma ward repository — inpatient.wards (db.sql).
 */

import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import type { WardsQueryDto } from '../../dto';
import { Ward } from '../../domain/ward.entity';
import { WardName } from '../../domain/value-objects/ward-name.vo';
import type {
  IWardRepository,
  WardPage,
} from '../../interfaces/ward-repository.interface';

const WARD_TYPES = new Set([
  'GENERAL',
  'ICU',
  'NICU',
  'MATERNITY',
  'PEDIATRIC',
  'PRIVATE',
  'SEMI_PRIVATE',
]);

@Injectable()
export class PrismaWardRepository implements IWardRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async save(entity: Ward): Promise<Ward> {
    const name = entity.getName().getValue();
    const wardType = entity.getWardType();
    if (!WARD_TYPES.has(wardType)) {
      throw new BadRequestException(
        `wardType must be one of ${[...WARD_TYPES].join(', ')}`,
      );
    }

    const existing = await this.prisma.wards.findFirst({
      where: { id: entity.getId() },
    });

    if (existing) {
      const row = await this.prisma.wards.update({
        where: { id: entity.getId() },
        data: {
          name,
          ward_type: wardType,
          department_id: entity.getDepartmentId() ?? null,
          daily_rate: entity.getDailyRate(),
          capacity: entity.getCapacity(),
          is_active: entity.getIsActive(),
        },
      });
      return this.toDomain(row);
    }

    const row = await this.prisma.wards.create({
      data: {
        name,
        ward_type: wardType,
        department_id: entity.getDepartmentId() ?? null,
        daily_rate: entity.getDailyRate(),
        capacity: entity.getCapacity(),
        is_active: true,
      },
    });
    return this.toDomain(row);
  }

  public async delete(id: string): Promise<void> {
    await this.softDelete(id);
  }

  public async findById(id: string): Promise<Ward | null> {
    const row = await this.prisma.wards.findFirst({
      where: { id, is_active: true },
    });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Ward[]> {
    const rows = await this.prisma.wards.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
      take: 200,
    });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (await this.prisma.wards.count({ where: { id } })) > 0;
  }

  public async findMany(query: WardsQueryDto): Promise<WardPage> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const where = {
      is_active: true,
      ...(query.search
        ? {
            name: {
              contains: query.search,
              mode: 'insensitive' as const,
            },
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.wards.count({ where }),
      this.prisma.wards.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
    ]);
    return { items: rows.map((r) => this.toDomain(r)), total };
  }

  public async softDelete(id: string): Promise<void> {
    await this.prisma.wards.update({
      where: { id },
      data: { is_active: false },
    });
  }

  protected toDomain(row: {
    id: string;
    name: string;
    ward_type: string;
    department_id: string | null;
    daily_rate: { toNumber?: () => number } | number | string;
    capacity: number;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }): Ward {
    const dailyRate =
      typeof row.daily_rate === 'object' && row.daily_rate?.toNumber
        ? row.daily_rate.toNumber()
        : Number(row.daily_rate);
    return Ward.reconstitute(
      row.id,
      {
        name: WardName.create(row.name),
        wardType: row.ward_type,
        departmentId: row.department_id,
        dailyRate,
        capacity: row.capacity,
        isActive: row.is_active,
      },
      row.created_at,
      row.updated_at,
    );
  }
}
