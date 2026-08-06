/**
 * File: laboratory.constants.ts
 * Module: laboratory
 * Purpose: Provider tokens, queue names, event constants.
 */

export const LABORATORY_REPOSITORY = Symbol('LABORATORY_REPOSITORY');
export const LABORATORY_SERVICE = Symbol('LABORATORY_SERVICE');

export const LABORATORY_QUEUE = {
  NAME: 'laboratory-queue',
  PROCESSORS: { PROCESS: 'process-laboratory' },
} as const;

export const LABORATORY_EVENTS = {
  CREATED: 'laboratory.created',
  UPDATED: 'laboratory.updated',
  DELETED: 'laboratory.deleted',
} as const;
