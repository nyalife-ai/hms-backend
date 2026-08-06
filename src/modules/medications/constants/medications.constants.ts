/**
 * File: medications.constants.ts
 * Module: medications
 * Purpose: Provider tokens, queue names, event constants.
 */

export const MEDICATIONS_REPOSITORY = Symbol('MEDICATIONS_REPOSITORY');
export const MEDICATIONS_SERVICE = Symbol('MEDICATIONS_SERVICE');

export const MEDICATIONS_QUEUE = {
  NAME: 'medications-queue',
  PROCESSORS: { PROCESS: 'process-medications' },
} as const;

export const MEDICATIONS_EVENTS = {
  CREATED: 'medications.created',
  UPDATED: 'medications.updated',
  DELETED: 'medications.deleted',
} as const;
