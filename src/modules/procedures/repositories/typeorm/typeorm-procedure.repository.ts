/**
 * File: typeorm-procedure.repository.ts
 * Module: procedures
 * Purpose: TypeORM repository adapter.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { ProceduresQueryDto } from '../../dto';
import { Procedure } from '../../domain/procedure.entity';
import { ProcedureName } from '../../domain/value-objects/procedure-name.vo';
import type {
  IProcedureRepository,
  ProcedurePage,
} from '../../interfaces/procedure-repository.interface';
import { ProcedureOrmEntity } from './procedure.orm-entity';

@Injectable()
export class TypeOrmProcedureRepository implements IProcedureRepository {
  public constructor(
    @InjectRepository(ProcedureOrmEntity)
    private readonly repo: Repository<ProcedureOrmEntity>,
  ) {}

  public async save(entity: Procedure): Promise<Procedure> {
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

  public async findById(id: string): Promise<Procedure | null> {
    const row = await this.repo.findOne({ where: { id, deletedAt: IsNull() } });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Procedure[]> {
    const rows = await this.repo.find({ where: { deletedAt: IsNull() } });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (await this.repo.count({ where: { id, deletedAt: IsNull() } })) > 0;
  }

  public async findMany(query: ProceduresQueryDto): Promise<ProcedurePage> {
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

  private toDomain(row: ProcedureOrmEntity): Procedure {
    return Procedure.reconstitute(
      row.id,
      {
        name: ProcedureName.create(row.name),
        description: row.description ?? row.name,
        consultationId: '00000000-0000-0000-0000-000000000000',
        patientId: '00000000-0000-0000-0000-000000000000',
      },
      row.createdAt,
      row.updatedAt,
    );
  }
}
