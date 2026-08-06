/**
 * File: wards.constants.ts
 * Module: wards
 * Purpose: Provider tokens, queue names, event constants.
 */

export const WARDS_REPOSITORY = Symbol('WARDS_REPOSITORY');
export const WARDS_SERVICE = Symbol('WARDS_SERVICE');

export const WARDS_QUEUE = {
  NAME: 'wards-queue',
  PROCESSORS: { PROCESS: 'process-wards' },
} as const;

export const WARDS_EVENTS = {
  CREATED: 'wards.created',
  UPDATED: 'wards.updated',
  DELETED: 'wards.deleted',
} as const;
