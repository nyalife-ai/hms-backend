/**
 * File: consultations.constants.ts
 * Module: consultations
 * Purpose: Provider tokens, queue names, event constants.
 */

export const CONSULTATIONS_REPOSITORY = Symbol('CONSULTATIONS_REPOSITORY');
export const CONSULTATIONS_SERVICE = Symbol('CONSULTATIONS_SERVICE');

export const CONSULTATIONS_QUEUE = {
  NAME: 'consultations-queue',
  PROCESSORS: { PROCESS: 'process-consultations' },
} as const;

export const CONSULTATIONS_EVENTS = {
  CREATED: 'consultations.created',
  UPDATED: 'consultations.updated',
  DELETED: 'consultations.deleted',
} as const;
