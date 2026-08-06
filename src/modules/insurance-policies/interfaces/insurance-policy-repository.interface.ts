/**
 * File: insurance-policy-repository.interface.ts
 * Module: insurance-policies
 * Purpose: Repository port (core Repository + pagination).
 */

import type { Repository } from '../../../core/contracts';
import type { InsurancePolicy } from '../domain/insurance-policy.entity';
import type { InsurancePoliciesQueryDto } from '../dto';

export type InsurancePolicyPage = { items: InsurancePolicy[]; total: number };

export interface IInsurancePolicyRepository extends Repository<InsurancePolicy, string> {
  findMany(query: InsurancePoliciesQueryDto): Promise<InsurancePolicyPage>;
  softDelete(id: string): Promise<void>;
}
