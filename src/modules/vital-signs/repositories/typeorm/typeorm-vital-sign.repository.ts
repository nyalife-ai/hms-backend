/**
 * File: typeorm-vital-sign.repository.ts
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { VitalSignsQueryDto } from '../../dto';
import { VitalSign } from '../../domain/vital-sign.entity';
import { VitalSignName } from '../../domain/value-objects/vital-sign-name.vo';
import type {
  IVitalSignRepository,
  VitalSignPage,
} from '../../interfaces/vital-sign-repository.interface';
import { VitalSignOrmEntity } from './vital-sign.orm-entity';

@Injectable()
export class TypeOrmVitalSignRepository implements IVitalSignRepository {
  public constructor(
    @InjectRepository(VitalSignOrmEntity)
    private readonly repo: Repository<VitalSignOrmEntity>,
  ) {}

  public async save(entity: VitalSign): Promise<VitalSign> {
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

  public async findById(id: string): Promise<VitalSign | null> {
    const row = await this.repo.findOne({ where: { id, deletedAt: IsNull() } });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<VitalSign[]> {
    const rows = await this.repo.find({ where: { deletedAt: IsNull() } });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (await this.repo.count({ where: { id, deletedAt: IsNull() } })) > 0;
  }

  public async findMany(query: VitalSignsQueryDto): Promise<VitalSignPage> {
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

  private toDomain(row: VitalSignOrmEntity): VitalSign {
    return VitalSign.reconstitute(
      row.id,
      {
        name: VitalSignName.create(row.name),
        description: row.description ?? undefined,
        patientId: '00000000-0000-0000-0000-000000000000',
        recordedBy: '00000000-0000-0000-0000-000000000000',
        isVoided: false,
      },
      row.createdAt,
      row.updatedAt,
    );
  }
}
