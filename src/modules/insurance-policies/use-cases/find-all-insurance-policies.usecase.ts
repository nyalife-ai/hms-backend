/**
 * File: find-all-insurance-policies.usecase.ts
 * Module: insurance-policies
 * Purpose: Paginated list of insurance-policies.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { InsurancePoliciesQueryDto } from '../dto';
import { INSURANCE_POLICIES_REPOSITORY } from '../constants/insurance-policies.constants';
import type { IInsurancePolicyRepository, InsurancePolicyPage } from '../interfaces/insurance-policy-repository.interface';

@Injectable()
export class FindAllInsurancePoliciesUseCase {
  public constructor(
    @Inject(INSURANCE_POLICIES_REPOSITORY) private readonly repository: IInsurancePolicyRepository,
  ) {}

  public async execute(query: InsurancePoliciesQueryDto): Promise<Result<InsurancePolicyPage, string>> {
    try {
      const page = await this.repository.findMany(query);
      return Result.success(page);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'List failed');
    }
  }
}
