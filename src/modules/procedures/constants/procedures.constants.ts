/**
 * File: procedures.constants.ts
 * Module: procedures
 * Purpose: Provider tokens, queue names, event constants.
 */

export const PROCEDURES_REPOSITORY = Symbol('PROCEDURES_REPOSITORY');
export const PROCEDURES_SERVICE = Symbol('PROCEDURES_SERVICE');

export const PROCEDURES_QUEUE = {
  NAME: 'procedures-queue',
  PROCESSORS: { PROCESS: 'process-procedures' },
} as const;

export const PROCEDURES_EVENTS = {
  CREATED: 'procedures.created',
  UPDATED: 'procedures.updated',
  DELETED: 'procedures.deleted',
} as const;
