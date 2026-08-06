/**
 * File: update-insurance-policy.usecase.ts
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import type { UpdateInsurancePolicyDto } from '../dto';
import { INSURANCE_POLICIES_REPOSITORY } from '../constants/insurance-policies.constants';
import type { InsurancePolicy } from '../domain/insurance-policy.entity';
import type { IInsurancePolicyRepository } from '../interfaces/insurance-policy-repository.interface';

@Injectable()
export class UpdateInsurancePolicyUseCase {
  public constructor(
    @Inject(INSURANCE_POLICIES_REPOSITORY)
    private readonly repository: IInsurancePolicyRepository,
  ) {}

  public async execute(
    id: string,
    dto: UpdateInsurancePolicyDto,
  ): Promise<Result<InsurancePolicy, NotFoundException | string>> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      return Result.failure(new NotFoundException('InsurancePolicy', id));
    }
    try {
      existing.update({
        name: dto.name,
        description: dto.description,
        groupNumber: dto.groupNumber,
        memberType: dto.memberType,
        principalPolicyId: dto.principalPolicyId,
        startDate: dto.startDate,
        expiryDate: dto.expiryDate,
        copayAmount: dto.copayAmount,
      });
      const saved = await this.repository.save(existing);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Update failed');
    }
  }
}
