/**
 * File: vital-signs.constants.ts
 * Module: vital-signs
 * Purpose: Provider tokens, queue names, event constants.
 */

export const VITAL_SIGNS_REPOSITORY = Symbol('VITAL_SIGNS_REPOSITORY');
export const VITAL_SIGNS_SERVICE = Symbol('VITAL_SIGNS_SERVICE');

export const VITAL_SIGNS_QUEUE = {
  NAME: 'vital-signs-queue',
  PROCESSORS: { PROCESS: 'process-vital-signs' },
} as const;

export const VITAL_SIGNS_EVENTS = {
  CREATED: 'vital-signs.created',
  UPDATED: 'vital-signs.updated',
  DELETED: 'vital-signs.deleted',
} as const;
