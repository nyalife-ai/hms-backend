/**
 * File: patients.constants.ts
 * Module: patients
 * Purpose: Provider tokens, queue names, event constants.
 */

export const PATIENTS_REPOSITORY = Symbol('PATIENTS_REPOSITORY');
export const PATIENTS_SERVICE = Symbol('PATIENTS_SERVICE');

export const PATIENTS_QUEUE = {
  NAME: 'patients-queue',
  PROCESSORS: { PROCESS: 'process-patients' },
} as const;

export const PATIENTS_EVENTS = {
  CREATED: 'patients.created',
  UPDATED: 'patients.updated',
  DELETED: 'patients.deleted',
} as const;
