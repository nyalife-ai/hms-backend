/**
 * File: audit.constants.ts
 * Module: audit
 * Purpose: Provider tokens, queue names, event constants.
 */

export const AUDIT_REPOSITORY = Symbol('AUDIT_REPOSITORY');
export const AUDIT_SERVICE = Symbol('AUDIT_SERVICE');

export const AUDIT_QUEUE = {
  NAME: 'audit-queue',
  PROCESSORS: { PROCESS: 'process-audit' },
} as const;

export const AUDIT_EVENTS = {
  CREATED: 'audit.created',
  UPDATED: 'audit.updated',
  DELETED: 'audit.deleted',
} as const;
