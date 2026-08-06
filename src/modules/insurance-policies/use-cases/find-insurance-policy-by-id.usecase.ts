/**
 * File: find-insurance-policy-by-id.usecase.ts
 * Module: insurance-policies
 * Purpose: Find insurance-policy by id.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { INSURANCE_POLICIES_REPOSITORY } from '../constants/insurance-policies.constants';
import type { InsurancePolicy } from '../domain/insurance-policy.entity';
import type { IInsurancePolicyRepository } from '../interfaces/insurance-policy-repository.interface';

@Injectable()
export class FindInsurancePolicyByIdUseCase {
  public constructor(
    @Inject(INSURANCE_POLICIES_REPOSITORY) private readonly repository: IInsurancePolicyRepository,
  ) {}

  public async execute(id: string): Promise<Result<InsurancePolicy, NotFoundException>> {
    const entity = await this.repository.findById(id);
    if (!entity) {
      return Result.failure(new NotFoundException('InsurancePolicy', id));
    }
    return Result.success(entity);
  }
}
