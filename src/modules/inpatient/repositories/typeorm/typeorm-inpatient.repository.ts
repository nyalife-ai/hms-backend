/**
 * File: typeorm-inpatient.repository.ts
 * Module: inpatient
 * Purpose: TypeORM repository adapter.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { InpatientQueryDto } from '../../dto';
import { Inpatient } from '../../domain/inpatient.entity';
import { InpatientName } from '../../domain/value-objects/inpatient-name.vo';
import type { IInpatientRepository, InpatientPage } from '../../interfaces/inpatient-repository.interface';
import { InpatientOrmEntity } from './inpatient.orm-entity';

@Injectable()
export class TypeOrmInpatientRepository implements IInpatientRepository {
  public constructor(
    @InjectRepository(InpatientOrmEntity)
    private readonly repo: Repository<InpatientOrmEntity>,
  ) {}

  public async save(_entity: Inpatient): Promise<Inpatient> {
    throw new Error(
      'Use POST /ipd/admissions (IpdJourneyUseCase) for admit/transfer/discharge',
    );
  }

  public async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  public async findById(id: string): Promise<Inpatient | null> {
    const row = await this.repo.findOne({ where: { id, deletedAt: IsNull() } });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Inpatient[]> {
    const rows = await this.repo.find({ where: { deletedAt: IsNull() } });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (await this.repo.count({ where: { id, deletedAt: IsNull() } })) > 0;
  }

  public async findMany(query: InpatientQueryDto): Promise<InpatientPage> {
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

  public async softDelete(_id: string): Promise<void> {
    throw new Error('Use POST /ipd/admissions/:id/discharge to end an admission');
  }

  private toDomain(row: InpatientOrmEntity): Inpatient {
    return Inpatient.reconstitute(
      row.id,
      { name: InpatientName.create(row.name), description: row.description ?? undefined },
      row.createdAt,
      row.updatedAt,
    );
  }
}
