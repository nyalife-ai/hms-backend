/**
 * File: typeorm-laboratory.repository.ts
 * Module: laboratory
 * Purpose: TypeORM repository adapter.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { LaboratoryQueryDto } from '../../dto';
import { Laboratory } from '../../domain/laboratory.entity';
import { LaboratoryName } from '../../domain/value-objects/laboratory-name.vo';
import type { ILaboratoryRepository, LaboratoryPage } from '../../interfaces/laboratory-repository.interface';
import { LaboratoryOrmEntity } from './laboratory.orm-entity';

@Injectable()
export class TypeOrmLaboratoryRepository implements ILaboratoryRepository {
  public constructor(
    @InjectRepository(LaboratoryOrmEntity)
    private readonly repo: Repository<LaboratoryOrmEntity>,
  ) {}

  public async save(entity: Laboratory): Promise<Laboratory> {
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

  public async findById(id: string): Promise<Laboratory | null> {
    const row = await this.repo.findOne({ where: { id, deletedAt: IsNull() } });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Laboratory[]> {
    const rows = await this.repo.find({ where: { deletedAt: IsNull() } });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (await this.repo.count({ where: { id, deletedAt: IsNull() } })) > 0;
  }

  public async findMany(query: LaboratoryQueryDto): Promise<LaboratoryPage> {
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

  private toDomain(row: LaboratoryOrmEntity): Laboratory {
    return Laboratory.reconstitute(
      row.id,
      {
        name: LaboratoryName.create(row.name),
        description: row.description ?? undefined,
      },
      row.createdAt,
      row.updatedAt,
    );
  }
}
