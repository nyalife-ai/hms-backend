/**
 * File: pharmacy.constants.ts
 * Module: pharmacy
 * Purpose: Provider tokens, queue names, event constants.
 */

export const PHARMACY_REPOSITORY = Symbol('PHARMACY_REPOSITORY');
export const PHARMACY_SERVICE = Symbol('PHARMACY_SERVICE');

export const PHARMACY_QUEUE = {
  NAME: 'pharmacy-queue',
  PROCESSORS: { PROCESS: 'process-pharmacy' },
} as const;

export const PHARMACY_EVENTS = {
  CREATED: 'pharmacy.created',
  UPDATED: 'pharmacy.updated',
  DELETED: 'pharmacy.deleted',
} as const;
