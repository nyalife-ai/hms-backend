/**
 * File: typeorm-department.repository.ts
 * Module: departments
 * Purpose: TypeORM repository adapter.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { CreateDepartmentDto, DepartmentsQueryDto, UpdateDepartmentDto } from '../../dto';
import { Department } from '../../domain/department.entity';
import { DepartmentName } from '../../domain/value-objects/department-name.vo';
import type { IDepartmentRepository, DepartmentPage } from '../../interfaces/department-repository.interface';
import { DepartmentOrmEntity } from './department.orm-entity';

@Injectable()
export class TypeOrmDepartmentRepository implements IDepartmentRepository {
  public constructor(
    @InjectRepository(DepartmentOrmEntity)
    private readonly repo: Repository<DepartmentOrmEntity>,
  ) {}

  public async save(entity: Department): Promise<Department> {
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

  public async findById(id: string): Promise<Department | null> {
    const row = await this.repo.findOne({ where: { id, deletedAt: IsNull() } });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Department[]> {
    const rows = await this.repo.find({ where: { deletedAt: IsNull() } });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (await this.repo.count({ where: { id, deletedAt: IsNull() } })) > 0;
  }

  public async findMany(query: DepartmentsQueryDto): Promise<DepartmentPage> {
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

  private toDomain(row: DepartmentOrmEntity): Department {
    return Department.reconstitute(
      row.id,
      { name: DepartmentName.create(row.name), description: row.description ?? undefined },
      row.createdAt,
      row.updatedAt,
    );
  }
}
