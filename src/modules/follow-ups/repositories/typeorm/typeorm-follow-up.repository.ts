/**
 * File: typeorm-follow-up.repository.ts
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { FollowUpsQueryDto } from '../../dto';
import { FollowUp } from '../../domain/follow-up.entity';
import { FollowUpName } from '../../domain/value-objects/follow-up-name.vo';
import type {
  IFollowUpRepository,
  FollowUpPage,
} from '../../interfaces/follow-up-repository.interface';
import { FollowUpOrmEntity } from './follow-up.orm-entity';

@Injectable()
export class TypeOrmFollowUpRepository implements IFollowUpRepository {
  public constructor(
    @InjectRepository(FollowUpOrmEntity)
    private readonly repo: Repository<FollowUpOrmEntity>,
  ) {}

  public async save(entity: FollowUp): Promise<FollowUp> {
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

  public async findById(id: string): Promise<FollowUp | null> {
    const row = await this.repo.findOne({ where: { id, deletedAt: IsNull() } });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<FollowUp[]> {
    const rows = await this.repo.find({ where: { deletedAt: IsNull() } });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (await this.repo.count({ where: { id, deletedAt: IsNull() } })) > 0;
  }

  public async findMany(query: FollowUpsQueryDto): Promise<FollowUpPage> {
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

  public async findByIdScoped(id: string): Promise<FollowUp | null> {
    return this.findById(id);
  }

  public async getSummary() {
    return {
      scheduledThisMonth: 0,
      completedThisMonth: 0,
      dueWithin7Days: 0,
      overdue: 0,
    };
  }

  public async findByConsultationAndDate(): Promise<FollowUp | null> {
    return null;
  }

  public async findLatestConsultationId(): Promise<string | null> {
    return null;
  }

  public async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }

  private toDomain(row: FollowUpOrmEntity): FollowUp {
    return FollowUp.reconstitute(
      row.id,
      {
        name: FollowUpName.create(row.name),
        description: row.description ?? undefined,
        patientId: '00000000-0000-0000-0000-000000000000',
        consultationId: '00000000-0000-0000-0000-000000000000',
        followUpDate: row.createdAt,
        reason: row.description ?? row.name,
        status: 'SCHEDULED',
        createdBy: '00000000-0000-0000-0000-000000000000',
      },
      row.createdAt,
      row.updatedAt,
    );
  }
}
