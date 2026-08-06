/**
 * File: typeorm-medication.repository.ts
 * Module: medications
 * Purpose: TypeORM repository adapter.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { CreateMedicationDto, MedicationsQueryDto, UpdateMedicationDto } from '../../dto';
import { Medication } from '../../domain/medication.entity';
import { MedicationName } from '../../domain/value-objects/medication-name.vo';
import type { IMedicationRepository, MedicationPage } from '../../interfaces/medication-repository.interface';
import { MedicationOrmEntity } from './medication.orm-entity';

@Injectable()
export class TypeOrmMedicationRepository implements IMedicationRepository {
  public constructor(
    @InjectRepository(MedicationOrmEntity)
    private readonly repo: Repository<MedicationOrmEntity>,
  ) {}

  public async save(entity: Medication): Promise<Medication> {
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

  public async findById(id: string): Promise<Medication | null> {
    const row = await this.repo.findOne({ where: { id, deletedAt: IsNull() } });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Medication[]> {
    const rows = await this.repo.find({ where: { deletedAt: IsNull() } });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (await this.repo.count({ where: { id, deletedAt: IsNull() } })) > 0;
  }

  public async findMany(query: MedicationsQueryDto): Promise<MedicationPage> {
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

  private toDomain(row: MedicationOrmEntity): Medication {
    return Medication.reconstitute(
      row.id,
      {
        name: MedicationName.create(row.name),
        description: row.description ?? undefined,
        standardSellingPrice: 0,
        isActive: true,
      },
      row.createdAt,
      row.updatedAt,
    );
  }
}
