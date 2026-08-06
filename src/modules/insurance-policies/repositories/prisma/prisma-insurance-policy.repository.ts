/**
 * Prisma insurance-policy repository — patients.insurance_policies.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import type { InsurancePoliciesQueryDto } from '../../dto';
import { InsurancePolicy } from '../../domain/insurance-policy.entity';
import { InsurancePolicyName } from '../../domain/value-objects/insurance-policy-name.vo';
import type {
  IInsurancePolicyRepository,
  InsurancePolicyPage,
} from '../../interfaces/insurance-policy-repository.interface';

function toNum(
  v: { toNumber?: () => number } | number | string | null | undefined,
): number {
  if (v == null) return 0;
  if (typeof v === 'object' && v?.toNumber) return v.toNumber();
  return Number(v);
}

@Injectable()
export class PrismaInsurancePolicyRepository
  implements IInsurancePolicyRepository
{
  public constructor(private readonly prisma: PrismaService) {}

  public async save(entity: InsurancePolicy): Promise<InsurancePolicy> {
    const existing = await this.prisma.insurancePolicies.findFirst({
      where: { id: entity.getId() },
    });

    if (existing) {
      const row = await this.prisma.insurancePolicies.update({
        where: { id: entity.getId() },
        data: {
          policy_number: entity.getName().getValue(),
          group_number: entity.getGroupNumber() ?? null,
          member_type: entity.getMemberType(),
          principal_policy_id: entity.getPrincipalPolicyId() ?? null,
          start_date: entity.getStartDate(),
          expiry_date: entity.getExpiryDate(),
          copay_amount: entity.getCopayAmount(),
          is_active: entity.getIsActive(),
        },
      });
      return this.toDomain(row);
    }

    const row = await this.prisma.insurancePolicies.create({
      data: {
        patient_id: entity.getPatientId(),
        provider_id: entity.getProviderId(),
        policy_number: entity.getName().getValue(),
        group_number: entity.getGroupNumber() ?? null,
        member_type: entity.getMemberType(),
        principal_policy_id: entity.getPrincipalPolicyId() ?? null,
        start_date: entity.getStartDate(),
        expiry_date: entity.getExpiryDate(),
        copay_amount: entity.getCopayAmount(),
        is_active: true,
      },
    });
    return this.toDomain(row);
  }

  public async delete(id: string): Promise<void> {
    await this.softDelete(id);
  }

  public async findById(id: string): Promise<InsurancePolicy | null> {
    const row = await this.prisma.insurancePolicies.findFirst({
      where: { id, is_active: true },
    });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<InsurancePolicy[]> {
    const rows = await this.prisma.insurancePolicies.findMany({
      where: { is_active: true },
      orderBy: { created_at: 'desc' },
      take: 200,
    });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (
      (await this.prisma.insurancePolicies.count({
        where: { id, is_active: true },
      })) > 0
    );
  }

  public async findMany(
    query: InsurancePoliciesQueryDto,
  ): Promise<InsurancePolicyPage> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const where = {
      is_active: true,
      ...(query.search
        ? {
            OR: [
              {
                policy_number: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                group_number: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                member_type: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.insurancePolicies.count({ where }),
      this.prisma.insurancePolicies.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
    ]);
    return { items: rows.map((r) => this.toDomain(r)), total };
  }

  public async softDelete(id: string): Promise<void> {
    await this.prisma.insurancePolicies.update({
      where: { id },
      data: { is_active: false },
    });
  }

  protected toDomain(row: {
    id: string;
    patient_id: string;
    provider_id: string;
    policy_number: string;
    group_number: string | null;
    member_type: string;
    principal_policy_id: string | null;
    start_date: Date;
    expiry_date: Date;
    copay_amount: { toNumber?: () => number } | number | string | null;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }): InsurancePolicy {
    return InsurancePolicy.reconstitute(
      row.id,
      {
        name: InsurancePolicyName.create(row.policy_number),
        description: row.member_type,
        patientId: row.patient_id,
        providerId: row.provider_id,
        groupNumber: row.group_number,
        memberType: row.member_type,
        principalPolicyId: row.principal_policy_id,
        startDate: row.start_date,
        expiryDate: row.expiry_date,
        copayAmount: toNum(row.copay_amount),
        isActive: row.is_active,
      },
      row.created_at,
      row.updated_at,
    );
  }
}
