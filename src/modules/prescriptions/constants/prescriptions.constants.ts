/**
 * File: prescriptions.constants.ts
 * Module: prescriptions
 * Purpose: Provider tokens, queue names, event constants.
 */

export const PRESCRIPTIONS_REPOSITORY = Symbol('PRESCRIPTIONS_REPOSITORY');
export const PRESCRIPTIONS_SERVICE = Symbol('PRESCRIPTIONS_SERVICE');

export const PRESCRIPTIONS_QUEUE = {
  NAME: 'prescriptions-queue',
  PROCESSORS: { PROCESS: 'process-prescriptions' },
} as const;

export const PRESCRIPTIONS_EVENTS = {
  CREATED: 'prescriptions.created',
  UPDATED: 'prescriptions.updated',
  DELETED: 'prescriptions.deleted',
} as const;
