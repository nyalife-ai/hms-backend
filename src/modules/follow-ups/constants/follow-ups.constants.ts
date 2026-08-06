/**
 * File: follow-ups.constants.ts
 * Module: follow-ups
 * Purpose: Provider tokens, queue names, event constants.
 */

export const FOLLOW_UPS_REPOSITORY = Symbol('FOLLOW_UPS_REPOSITORY');
export const FOLLOW_UPS_SERVICE = Symbol('FOLLOW_UPS_SERVICE');

export const FOLLOW_UPS_QUEUE = {
  NAME: 'follow-ups-queue',
  PROCESSORS: { PROCESS: 'process-follow-ups' },
} as const;

export const FOLLOW_UPS_EVENTS = {
  CREATED: 'follow-ups.created',
  UPDATED: 'follow-ups.updated',
  DELETED: 'follow-ups.deleted',
} as const;
