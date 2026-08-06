/**
 * File: typeorm-pharmacy.repository.ts
 * Module: pharmacy
 * Purpose: TypeORM repository adapter.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { CreatePharmacyDto, PharmacyQueryDto, UpdatePharmacyDto } from '../../dto';
import { Pharmacy } from '../../domain/pharmacy.entity';
import { PharmacyName } from '../../domain/value-objects/pharmacy-name.vo';
import type { IPharmacyRepository, PharmacyPage } from '../../interfaces/pharmacy-repository.interface';
import { PharmacyOrmEntity } from './pharmacy.orm-entity';

@Injectable()
export class TypeOrmPharmacyRepository implements IPharmacyRepository {
  public constructor(
    @InjectRepository(PharmacyOrmEntity)
    private readonly repo: Repository<PharmacyOrmEntity>,
  ) {}

  public async save(entity: Pharmacy): Promise<Pharmacy> {
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

  public async findById(id: string): Promise<Pharmacy | null> {
    const row = await this.repo.findOne({ where: { id, deletedAt: IsNull() } });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Pharmacy[]> {
    const rows = await this.repo.find({ where: { deletedAt: IsNull() } });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (await this.repo.count({ where: { id, deletedAt: IsNull() } })) > 0;
  }

  public async findMany(query: PharmacyQueryDto): Promise<PharmacyPage> {
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

  private toDomain(row: PharmacyOrmEntity): Pharmacy {
    return Pharmacy.reconstitute(
      row.id,
      { name: PharmacyName.create(row.name), description: row.description ?? undefined },
      row.createdAt,
      row.updatedAt,
    );
  }
}
