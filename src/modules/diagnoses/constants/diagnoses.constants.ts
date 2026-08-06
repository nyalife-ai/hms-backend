/**
 * File: diagnoses.constants.ts
 * Module: diagnoses
 * Purpose: Provider tokens, queue names, event constants.
 */

export const DIAGNOSES_REPOSITORY = Symbol('DIAGNOSES_REPOSITORY');
export const DIAGNOSES_SERVICE = Symbol('DIAGNOSES_SERVICE');

export const DIAGNOSES_QUEUE = {
  NAME: 'diagnoses-queue',
  PROCESSORS: { PROCESS: 'process-diagnoses' },
} as const;

export const DIAGNOSES_EVENTS = {
  CREATED: 'diagnoses.created',
  UPDATED: 'diagnoses.updated',
  DELETED: 'diagnoses.deleted',
} as const;
