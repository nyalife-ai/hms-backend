/**
 * File: appointments.constants.ts
 * Module: appointments
 * Purpose: Provider tokens, queue names, event constants.
 */

export const APPOINTMENTS_REPOSITORY = Symbol('APPOINTMENTS_REPOSITORY');
export const APPOINTMENTS_SERVICE = Symbol('APPOINTMENTS_SERVICE');

export const APPOINTMENTS_QUEUE = {
  NAME: 'appointments-queue',
  PROCESSORS: { PROCESS: 'process-appointments' },
} as const;

export const APPOINTMENTS_EVENTS = {
  CREATED: 'appointments.created',
  UPDATED: 'appointments.updated',
  DELETED: 'appointments.deleted',
} as const;
