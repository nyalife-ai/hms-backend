/**
 * File: typeorm-bed.repository.ts
 * Module: beds
 * Purpose: TypeORM repository adapter.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { CreateBedDto, BedsQueryDto, UpdateBedDto } from '../../dto';
import { Bed } from '../../domain/bed.entity';
import { BedName } from '../../domain/value-objects/bed-name.vo';
import type { IBedRepository, BedPage } from '../../interfaces/bed-repository.interface';
import { BedOrmEntity } from './bed.orm-entity';

@Injectable()
export class TypeOrmBedRepository implements IBedRepository {
  public constructor(
    @InjectRepository(BedOrmEntity)
    private readonly repo: Repository<BedOrmEntity>,
  ) {}

  public async save(entity: Bed): Promise<Bed> {
    const row = this.repo.create({
      id: entity.getId(),
      name: entity.getName().getValue(),
      description: entity.getDescription() ?? null,
      createdAt: entity.getCreatedAt(),
      updatedAt: entity.getUpdatedAt(),
    });
    return this.toDomain(await this.repo.save(row));
  }

  public async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  public async findById(id: string): Promise<Bed | null> {
    const row = await this.repo.findOne({ where: { id, deletedAt: IsNull() } });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Bed[]> {
    const rows = await this.repo.find({ where: { deletedAt: IsNull() } });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (await this.repo.count({ where: { id, deletedAt: IsNull() } })) > 0;
  }

  public async findMany(query: BedsQueryDto): Promise<BedPage> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [rows, total] = await this.repo.findAndCount({
      where: { deletedAt: IsNull() },
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { items: rows.map((r) => this.toDomain(r)), total };
  }

  public async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }

  private toDomain(row: BedOrmEntity): Bed {
    return Bed.reconstitute(
      row.id,
      {
        name: BedName.create(row.name),
        wardId: '00000000-0000-0000-0000-000000000000',
        status: 'AVAILABLE',
        description: row.description ?? undefined,
      },
      row.createdAt,
      row.updatedAt,
    );
  }
}
