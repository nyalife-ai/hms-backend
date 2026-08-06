/**
 * Prisma bed repository — inpatient.beds.
 */

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import type { BedsQueryDto } from '../../dto';
import { Bed } from '../../domain/bed.entity';
import { BedName } from '../../domain/value-objects/bed-name.vo';
import type {
  IBedRepository,
  BedPage,
} from '../../interfaces/bed-repository.interface';

const BED_STATUSES = new Set([
  'AVAILABLE',
  'OCCUPIED',
  'MAINTENANCE',
  'RESERVED',
]);

@Injectable()
export class PrismaBedRepository implements IBedRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async save(entity: Bed): Promise<Bed> {
    const bedNumber = entity.getName().getValue();
    const status = entity.getStatus();
    if (!BED_STATUSES.has(status)) {
      throw new BadRequestException(
        `status must be one of ${[...BED_STATUSES].join(', ')}`,
      );
    }

    const ward = await this.prisma.wards.findFirst({
      where: { id: entity.getWardId(), is_active: true },
    });
    if (!ward) throw new NotFoundException('Ward not found');

    const existing = await this.prisma.beds.findFirst({
      where: { id: entity.getId() },
    });

    if (existing) {
      const row = await this.prisma.beds.update({
        where: { id: entity.getId() },
        data: { bed_number: bedNumber, status },
      });
      return this.toDomain(row);
    }

    const row = await this.prisma.beds.create({
      data: {
        ward_id: entity.getWardId(),
        bed_number: bedNumber,
        status,
      },
    });
    return this.toDomain(row);
  }

  public async delete(id: string): Promise<void> {
    await this.softDelete(id);
  }

  public async findById(id: string): Promise<Bed | null> {
    const row = await this.prisma.beds.findFirst({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Bed[]> {
    const rows = await this.prisma.beds.findMany({
      orderBy: [{ ward_id: 'asc' }, { bed_number: 'asc' }],
      take: 500,
    });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (await this.prisma.beds.count({ where: { id } })) > 0;
  }

  public async findMany(query: BedsQueryDto): Promise<BedPage> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const where = {
      ...(query.search
        ? {
            bed_number: {
              contains: query.search,
              mode: 'insensitive' as const,
            },
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.beds.count({ where }),
      this.prisma.beds.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ ward_id: 'asc' }, { bed_number: 'asc' }],
      }),
    ]);
    return { items: rows.map((r) => this.toDomain(r)), total };
  }

  public async softDelete(id: string): Promise<void> {
    await this.prisma.beds.update({
      where: { id },
      data: { status: 'MAINTENANCE' },
    });
  }

  protected toDomain(row: {
    id: string;
    ward_id: string;
    bed_number: string;
    status: string;
    created_at: Date;
    updated_at: Date;
  }): Bed {
    return Bed.reconstitute(
      row.id,
      {
        name: BedName.create(row.bed_number),
        wardId: row.ward_id,
        status: row.status,
      },
      row.created_at,
      row.updated_at,
    );
  }
}
