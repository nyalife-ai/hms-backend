/**
 * File: create-insurance-policy.usecase.ts
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { CreateInsurancePolicyDto } from '../dto';
import { InsurancePolicy } from '../domain/insurance-policy.entity';
import { INSURANCE_POLICIES_REPOSITORY } from '../constants/insurance-policies.constants';
import type { IInsurancePolicyRepository } from '../interfaces/insurance-policy-repository.interface';

@Injectable()
export class CreateInsurancePolicyUseCase {
  public constructor(
    @Inject(INSURANCE_POLICIES_REPOSITORY)
    private readonly repository: IInsurancePolicyRepository,
  ) {}

  public async execute(
    dto: CreateInsurancePolicyDto,
  ): Promise<Result<InsurancePolicy, string>> {
    try {
      const entity = InsurancePolicy.create({
        name: dto.name,
        description: dto.description,
        patientId: dto.patientId,
        providerId: dto.providerId,
        groupNumber: dto.groupNumber,
        memberType: dto.memberType,
        principalPolicyId: dto.principalPolicyId,
        startDate: dto.startDate,
        expiryDate: dto.expiryDate,
        copayAmount: dto.copayAmount,
      });
      const saved = await this.repository.save(entity);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Create failed');
    }
  }
}
