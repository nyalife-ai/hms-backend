/**
 * File: typeorm-radiology.repository.ts
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { RadiologyQueryDto } from '../../dto';
import { Radiology } from '../../domain/radiology.entity';
import { RadiologyName } from '../../domain/value-objects/radiology-name.vo';
import type {
  IRadiologyRepository,
  RadiologyPage,
} from '../../interfaces/radiology-repository.interface';
import { RadiologyOrmEntity } from './radiology.orm-entity';

@Injectable()
export class TypeOrmRadiologyRepository implements IRadiologyRepository {
  public constructor(
    @InjectRepository(RadiologyOrmEntity)
    private readonly repo: Repository<RadiologyOrmEntity>,
  ) {}

  public async save(entity: Radiology): Promise<Radiology> {
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

  public async findById(id: string): Promise<Radiology | null> {
    const row = await this.repo.findOne({ where: { id, deletedAt: IsNull() } });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Radiology[]> {
    const rows = await this.repo.find({ where: { deletedAt: IsNull() } });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (await this.repo.count({ where: { id, deletedAt: IsNull() } })) > 0;
  }

  public async findMany(query: RadiologyQueryDto): Promise<RadiologyPage> {
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

  private toDomain(row: RadiologyOrmEntity): Radiology {
    return Radiology.reconstitute(
      row.id,
      {
        name: RadiologyName.create(row.name),
        description: row.description ?? undefined,
        patientId: '00000000-0000-0000-0000-000000000000',
        scanTypeId: '00000000-0000-0000-0000-000000000000',
        requestedBy: '00000000-0000-0000-0000-000000000000',
        priority: 'ROUTINE',
        status: 'PENDING',
      },
      row.createdAt,
      row.updatedAt,
    );
  }
}
