/**
 * File: soft-delete-insurance-policy.usecase.ts
 * Module: insurance-policies
 * Purpose: Soft-delete insurance-policy.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { INSURANCE_POLICIES_REPOSITORY } from '../constants/insurance-policies.constants';
import type { IInsurancePolicyRepository } from '../interfaces/insurance-policy-repository.interface';

@Injectable()
export class SoftDeleteInsurancePolicyUseCase {
  public constructor(
    @Inject(INSURANCE_POLICIES_REPOSITORY) private readonly repository: IInsurancePolicyRepository,
  ) {}

  public async execute(id: string): Promise<Result<void, NotFoundException>> {
    if (!(await this.repository.exists(id))) {
      return Result.failure(new NotFoundException('InsurancePolicy', id));
    }
    await this.repository.softDelete(id);
    return Result.success(undefined);
  }
}
