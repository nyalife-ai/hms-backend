/**
 * File: departments.constants.ts
 * Module: departments
 * Purpose: Provider tokens, queue names, event constants.
 */

export const DEPARTMENTS_REPOSITORY = Symbol('DEPARTMENTS_REPOSITORY');
export const DEPARTMENTS_SERVICE = Symbol('DEPARTMENTS_SERVICE');

export const DEPARTMENTS_QUEUE = {
  NAME: 'departments-queue',
  PROCESSORS: { PROCESS: 'process-departments' },
} as const;

export const DEPARTMENTS_EVENTS = {
  CREATED: 'departments.created',
  UPDATED: 'departments.updated',
  DELETED: 'departments.deleted',
} as const;
