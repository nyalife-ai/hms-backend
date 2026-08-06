/**
 * File: typeorm-ward.repository.ts
 * Module: wards
 * Purpose: TypeORM repository adapter.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { CreateWardDto, WardsQueryDto, UpdateWardDto } from '../../dto';
import { Ward } from '../../domain/ward.entity';
import { WardName } from '../../domain/value-objects/ward-name.vo';
import type { IWardRepository, WardPage } from '../../interfaces/ward-repository.interface';
import { WardOrmEntity } from './ward.orm-entity';

@Injectable()
export class TypeOrmWardRepository implements IWardRepository {
  public constructor(
    @InjectRepository(WardOrmEntity)
    private readonly repo: Repository<WardOrmEntity>,
  ) {}

  public async save(entity: Ward): Promise<Ward> {
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

  public async findById(id: string): Promise<Ward | null> {
    const row = await this.repo.findOne({ where: { id, deletedAt: IsNull() } });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Ward[]> {
    const rows = await this.repo.find({ where: { deletedAt: IsNull() } });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (await this.repo.count({ where: { id, deletedAt: IsNull() } })) > 0;
  }

  public async findMany(query: WardsQueryDto): Promise<WardPage> {
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

  private toDomain(row: WardOrmEntity): Ward {
    return Ward.reconstitute(
      row.id,
      {
        name: WardName.create(row.name),
        wardType: 'GENERAL',
        dailyRate: 0,
        capacity: 0,
        isActive: true,
        description: row.description ?? undefined,
      },
      row.createdAt,
      row.updatedAt,
    );
  }
}
