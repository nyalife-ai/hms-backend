/**
 * File: typeorm-staff.repository.ts
 * Module: staff
 * Purpose: TypeORM repository adapter.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { CreateStaffDto, StaffQueryDto, UpdateStaffDto } from '../../dto';
import { Staff } from '../../domain/staff.entity';
import { StaffName } from '../../domain/value-objects/staff-name.vo';
import type { IStaffRepository, StaffPage } from '../../interfaces/staff-repository.interface';
import { StaffOrmEntity } from './staff.orm-entity';

@Injectable()
export class TypeOrmStaffRepository implements IStaffRepository {
  public constructor(
    @InjectRepository(StaffOrmEntity)
    private readonly repo: Repository<StaffOrmEntity>,
  ) {}

  public async save(entity: Staff): Promise<Staff> {
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

  public async findById(id: string): Promise<Staff | null> {
    const row = await this.repo.findOne({ where: { id, deletedAt: IsNull() } });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Staff[]> {
    const rows = await this.repo.find({ where: { deletedAt: IsNull() } });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (await this.repo.count({ where: { id, deletedAt: IsNull() } })) > 0;
  }

  public async findMany(query: StaffQueryDto): Promise<StaffPage> {
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

  private toDomain(row: StaffOrmEntity): Staff {
    return Staff.reconstitute(
      row.id,
      {
        name: StaffName.create(row.name),
        description: row.description ?? undefined,
        userId: '00000000-0000-0000-0000-000000000000',
        employeeId: row.name.slice(0, 30) || 'EMP',
        joinDate: row.createdAt,
        isActive: true,
      },
      row.createdAt,
      row.updatedAt,
    );
  }
}
