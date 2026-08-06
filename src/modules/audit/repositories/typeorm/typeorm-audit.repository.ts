/**
 * File: typeorm-audit.repository.ts
 * Module: audit
 * Purpose: TypeORM repository adapter.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { AuditQueryDto } from '../../dto';
import { Audit } from '../../domain/audit.entity';
import { AuditName } from '../../domain/value-objects/audit-name.vo';
import type { IAuditRepository, AuditPage } from '../../interfaces/audit-repository.interface';
import { AuditOrmEntity } from './audit.orm-entity';

@Injectable()
export class TypeOrmAuditRepository implements IAuditRepository {
  public constructor(
    @InjectRepository(AuditOrmEntity)
    private readonly repo: Repository<AuditOrmEntity>,
  ) {}

  public async save(entity: Audit): Promise<Audit> {
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

  public async findById(id: string): Promise<Audit | null> {
    const row = await this.repo.findOne({ where: { id, deletedAt: IsNull() } });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Audit[]> {
    const rows = await this.repo.find({ where: { deletedAt: IsNull() } });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (await this.repo.count({ where: { id, deletedAt: IsNull() } })) > 0;
  }

  public async findMany(query: AuditQueryDto): Promise<AuditPage> {
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
    throw new Error('Audit logs cannot be soft-deleted');
  }

  private toDomain(row: AuditOrmEntity): Audit {
    return Audit.reconstitute(
      row.id,
      {
        name: AuditName.create(row.name),
        description: row.description ?? undefined,
      },
      row.createdAt,
      row.updatedAt,
    );
  }
}
