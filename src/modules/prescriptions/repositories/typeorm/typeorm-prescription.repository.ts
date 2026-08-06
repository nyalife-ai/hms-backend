/**
 * File: typeorm-prescription.repository.ts
 * Module: prescriptions
 * Purpose: TypeORM repository adapter.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { CreatePrescriptionDto, PrescriptionsQueryDto, UpdatePrescriptionDto } from '../../dto';
import { Prescription } from '../../domain/prescription.entity';
import { PrescriptionName } from '../../domain/value-objects/prescription-name.vo';
import type { IPrescriptionRepository, PrescriptionPage } from '../../interfaces/prescription-repository.interface';
import { PrescriptionOrmEntity } from './prescription.orm-entity';

@Injectable()
export class TypeOrmPrescriptionRepository implements IPrescriptionRepository {
  public constructor(
    @InjectRepository(PrescriptionOrmEntity)
    private readonly repo: Repository<PrescriptionOrmEntity>,
  ) {}

  public async save(entity: Prescription): Promise<Prescription> {
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

  public async findById(id: string): Promise<Prescription | null> {
    const row = await this.repo.findOne({ where: { id, deletedAt: IsNull() } });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Prescription[]> {
    const rows = await this.repo.find({ where: { deletedAt: IsNull() } });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (await this.repo.count({ where: { id, deletedAt: IsNull() } })) > 0;
  }

  public async findMany(query: PrescriptionsQueryDto): Promise<PrescriptionPage> {
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

  private toDomain(row: PrescriptionOrmEntity): Prescription {
    return Prescription.reconstitute(
      row.id,
      {
        name: PrescriptionName.create(row.name),
        description: row.description ?? undefined,
        patientId: '00000000-0000-0000-0000-000000000000',
        prescribedBy: '00000000-0000-0000-0000-000000000000',
        status: 'PENDING',
        isVoided: false,
      },
      row.createdAt,
      row.updatedAt,
    );
  }
}
