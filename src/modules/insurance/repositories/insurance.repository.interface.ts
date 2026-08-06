/**
 * Insurance providers/policies persistence port.
 */

import type { InsuranceProvider } from '../types';

export const INSURANCE_REPOSITORY = Symbol('INSURANCE_REPOSITORY');

export type InsurancePolicyRow = {
  id: string;
  policy_number: string;
  member_number: string | null;
  status: string;
  patient: {
    user: {
      core_profiles_user_id: {
        first_name: string;
        last_name: string;
        phone: string | null;
      }[];
    };
  };
};

export interface IInsuranceRepository {
  listActiveProviders(): Promise<
    Array<{
      id: string;
      name: string;
      code: string;
      claim_submission_method: string | null;
    }>
  >;
  findProviderByIdOrCode(
    idOrCode: string,
  ): Promise<{
    id: string;
    name: string;
    code: string;
    claim_submission_method: string | null;
  } | null>;
  findActivePolicy(input: {
    providerId: string;
    policyNumber: string;
  }): Promise<InsurancePolicyRow | null>;
}

export function toInsuranceProvider(row: {
  id: string;
  name: string;
  code: string;
  claim_submission_method: string | null;
}): InsuranceProvider {
  const method = row.claim_submission_method;
  let integration: InsuranceProvider['integration'] = 'MANUAL';
  if (row.code === 'SHA') integration = 'SHA';
  else if ((method || '').toUpperCase() === 'API') integration = 'SLADE';
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    integration,
  };
}
