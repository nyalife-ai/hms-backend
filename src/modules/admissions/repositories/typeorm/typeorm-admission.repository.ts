/**
 * File: typeorm-admission.repository.ts
 * Module: admissions
 * Purpose: TypeORM repository adapter.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { CreateAdmissionDto, AdmissionsQueryDto, UpdateAdmissionDto } from '../../dto';
import { Admission } from '../../domain/admission.entity';
import { AdmissionName } from '../../domain/value-objects/admission-name.vo';
import type { IAdmissionRepository, AdmissionPage } from '../../interfaces/admission-repository.interface';
import { AdmissionOrmEntity } from './admission.orm-entity';

@Injectable()
export class TypeOrmAdmissionRepository implements IAdmissionRepository {
  public constructor(
    @InjectRepository(AdmissionOrmEntity)
    private readonly repo: Repository<AdmissionOrmEntity>,
  ) {}

  public async save(entity: Admission): Promise<Admission> {
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

  public async findById(id: string): Promise<Admission | null> {
    const row = await this.repo.findOne({ where: { id, deletedAt: IsNull() } });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Admission[]> {
    const rows = await this.repo.find({ where: { deletedAt: IsNull() } });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (await this.repo.count({ where: { id, deletedAt: IsNull() } })) > 0;
  }

  public async findMany(query: AdmissionsQueryDto): Promise<AdmissionPage> {
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

  private toDomain(row: AdmissionOrmEntity): Admission {
    return Admission.reconstitute(
      row.id,
      { name: AdmissionName.create(row.name), description: row.description ?? undefined },
      row.createdAt,
      row.updatedAt,
    );
  }
}
