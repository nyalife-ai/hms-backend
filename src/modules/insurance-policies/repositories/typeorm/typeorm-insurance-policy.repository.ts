/**
 * File: typeorm-insurance-policy.repository.ts
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { InsurancePoliciesQueryDto } from '../../dto';
import { InsurancePolicy } from '../../domain/insurance-policy.entity';
import { InsurancePolicyName } from '../../domain/value-objects/insurance-policy-name.vo';
import type {
  IInsurancePolicyRepository,
  InsurancePolicyPage,
} from '../../interfaces/insurance-policy-repository.interface';
import { InsurancePolicyOrmEntity } from './insurance-policy.orm-entity';

@Injectable()
export class TypeOrmInsurancePolicyRepository
  implements IInsurancePolicyRepository
{
  public constructor(
    @InjectRepository(InsurancePolicyOrmEntity)
    private readonly repo: Repository<InsurancePolicyOrmEntity>,
  ) {}

  public async save(entity: InsurancePolicy): Promise<InsurancePolicy> {
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

  public async findById(id: string): Promise<InsurancePolicy | null> {
    const row = await this.repo.findOne({ where: { id, deletedAt: IsNull() } });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<InsurancePolicy[]> {
    const rows = await this.repo.find({ where: { deletedAt: IsNull() } });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (await this.repo.count({ where: { id, deletedAt: IsNull() } })) > 0;
  }

  public async findMany(
    query: InsurancePoliciesQueryDto,
  ): Promise<InsurancePolicyPage> {
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

  private toDomain(row: InsurancePolicyOrmEntity): InsurancePolicy {
    const now = new Date();
    return InsurancePolicy.reconstitute(
      row.id,
      {
        name: InsurancePolicyName.create(row.name),
        description: row.description ?? undefined,
        patientId: '00000000-0000-0000-0000-000000000000',
        providerId: '00000000-0000-0000-0000-000000000000',
        memberType: 'PRINCIPAL',
        startDate: now,
        expiryDate: now,
        copayAmount: 0,
        isActive: true,
      },
      row.createdAt,
      row.updatedAt,
    );
  }
}
