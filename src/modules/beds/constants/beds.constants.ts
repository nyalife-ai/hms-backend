/**
 * File: beds.constants.ts
 * Module: beds
 * Purpose: Provider tokens, queue names, event constants.
 */

export const BEDS_REPOSITORY = Symbol('BEDS_REPOSITORY');
export const BEDS_SERVICE = Symbol('BEDS_SERVICE');

export const BEDS_QUEUE = {
  NAME: 'beds-queue',
  PROCESSORS: { PROCESS: 'process-beds' },
} as const;

export const BEDS_EVENTS = {
  CREATED: 'beds.created',
  UPDATED: 'beds.updated',
  DELETED: 'beds.deleted',
} as const;
