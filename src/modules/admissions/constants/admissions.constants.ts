/**
 * File: admissions.constants.ts
 * Module: admissions
 * Purpose: Provider tokens, queue names, event constants.
 */

export const ADMISSIONS_REPOSITORY = Symbol('ADMISSIONS_REPOSITORY');
export const ADMISSIONS_SERVICE = Symbol('ADMISSIONS_SERVICE');

export const ADMISSIONS_QUEUE = {
  NAME: 'admissions-queue',
  PROCESSORS: { PROCESS: 'process-admissions' },
} as const;

export const ADMISSIONS_EVENTS = {
  CREATED: 'admissions.created',
  UPDATED: 'admissions.updated',
  DELETED: 'admissions.deleted',
} as const;
