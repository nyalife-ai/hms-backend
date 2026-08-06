/**
 * Prisma insurance repository — insurance_providers + insurance_policies.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import type {
  IInsuranceRepository,
  InsurancePolicyRow,
} from './insurance.repository.interface';

@Injectable()
export class PrismaInsuranceRepository implements IInsuranceRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async listActiveProviders() {
    return this.prisma.insuranceProviders.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        code: true,
        claim_submission_method: true,
      },
    });
  }

  public async findProviderByIdOrCode(idOrCode: string) {
    return this.prisma.insuranceProviders.findFirst({
      where: {
        is_active: true,
        OR: [{ id: idOrCode }, { code: idOrCode }],
      },
      select: {
        id: true,
        name: true,
        code: true,
        claim_submission_method: true,
      },
    });
  }

  public async findActivePolicy(input: {
    providerId: string;
    policyNumber: string;
  }): Promise<InsurancePolicyRow | null> {
    return this.prisma.insurancePolicies.findFirst({
      where: {
        provider_id: input.providerId,
        policy_number: input.policyNumber,
        is_active: true,
      },
      include: {
        patient: {
          include: {
            user: { include: { core_profiles_user_id: true } },
          },
        },
      },
    }) as Promise<InsurancePolicyRow | null>;
  }
}
