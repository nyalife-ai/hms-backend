/**
 * File: staff.constants.ts
 * Module: staff
 * Purpose: Provider tokens, queue names, event constants.
 */

export const STAFF_REPOSITORY = Symbol('STAFF_REPOSITORY');
export const STAFF_SERVICE = Symbol('STAFF_SERVICE');

export const STAFF_QUEUE = {
  NAME: 'staff-queue',
  PROCESSORS: { PROCESS: 'process-staff' },
} as const;

export const STAFF_EVENTS = {
  CREATED: 'staff.created',
  UPDATED: 'staff.updated',
  DELETED: 'staff.deleted',
} as const;
