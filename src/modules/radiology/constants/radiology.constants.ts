/**
 * File: radiology.constants.ts
 * Module: radiology
 * Purpose: Provider tokens, queue names, event constants.
 */

export const RADIOLOGY_REPOSITORY = Symbol('RADIOLOGY_REPOSITORY');
export const RADIOLOGY_SERVICE = Symbol('RADIOLOGY_SERVICE');

export const RADIOLOGY_QUEUE = {
  NAME: 'radiology-queue',
  PROCESSORS: { PROCESS: 'process-radiology' },
} as const;

export const RADIOLOGY_EVENTS = {
  CREATED: 'radiology.created',
  UPDATED: 'radiology.updated',
  DELETED: 'radiology.deleted',
} as const;
