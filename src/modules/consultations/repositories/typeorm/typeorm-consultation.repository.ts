/**
 * File: typeorm-consultation.repository.ts
 * Module: consultations
 * Purpose: TypeORM repository adapter.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { CreateConsultationDto, ConsultationsQueryDto, UpdateConsultationDto } from '../../dto';
import { Consultation } from '../../domain/consultation.entity';
import { ConsultationName } from '../../domain/value-objects/consultation-name.vo';
import type { IConsultationRepository, ConsultationPage } from '../../interfaces/consultation-repository.interface';
import { ConsultationOrmEntity } from './consultation.orm-entity';

@Injectable()
export class TypeOrmConsultationRepository implements IConsultationRepository {
  public constructor(
    @InjectRepository(ConsultationOrmEntity)
    private readonly repo: Repository<ConsultationOrmEntity>,
  ) {}

  public async save(entity: Consultation): Promise<Consultation> {
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

  public async findById(id: string): Promise<Consultation | null> {
    const row = await this.repo.findOne({ where: { id, deletedAt: IsNull() } });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Consultation[]> {
    const rows = await this.repo.find({ where: { deletedAt: IsNull() } });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (await this.repo.count({ where: { id, deletedAt: IsNull() } })) > 0;
  }

  public async findMany(query: ConsultationsQueryDto): Promise<ConsultationPage> {
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

  private toDomain(row: ConsultationOrmEntity): Consultation {
    return Consultation.reconstitute(
      row.id,
      {
        name: ConsultationName.create(row.name),
        description: row.description ?? undefined,
        patientId: '00000000-0000-0000-0000-000000000000',
        doctorId: '00000000-0000-0000-0000-000000000000',
        createdBy: '00000000-0000-0000-0000-000000000000',
        status: 'IN_PROGRESS',
        consultationType: 'IN_PERSON',
        priority: 'NORMAL',
      },
      row.createdAt,
      row.updatedAt,
    );
  }
}
