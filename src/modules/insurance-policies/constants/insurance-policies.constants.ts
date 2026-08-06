/**
 * File: insurance-policies.constants.ts
 * Module: insurance-policies
 * Purpose: Provider tokens, queue names, event constants.
 */

export const INSURANCE_POLICIES_REPOSITORY = Symbol('INSURANCE_POLICIES_REPOSITORY');
export const INSURANCE_POLICIES_SERVICE = Symbol('INSURANCE_POLICIES_SERVICE');

export const INSURANCE_POLICIES_QUEUE = {
  NAME: 'insurance-policies-queue',
  PROCESSORS: { PROCESS: 'process-insurance-policies' },
} as const;

export const INSURANCE_POLICIES_EVENTS = {
  CREATED: 'insurance-policies.created',
  UPDATED: 'insurance-policies.updated',
  DELETED: 'insurance-policies.deleted',
} as const;
