/**
 * File: inpatient.constants.ts
 * Module: inpatient
 * Purpose: Provider tokens, queue names, event constants.
 */

export const INPATIENT_REPOSITORY = Symbol('INPATIENT_REPOSITORY');
export const INPATIENT_SERVICE = Symbol('INPATIENT_SERVICE');

export const INPATIENT_QUEUE = {
  NAME: 'inpatient-queue',
  PROCESSORS: { PROCESS: 'process-inpatient' },
} as const;

export const INPATIENT_EVENTS = {
  CREATED: 'inpatient.created',
  UPDATED: 'inpatient.updated',
  DELETED: 'inpatient.deleted',
} as const;
