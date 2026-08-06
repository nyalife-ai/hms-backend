/**
 * File: documents.constants.ts
 * Module: documents
 * Purpose: Provider tokens, queue names, event constants.
 */

export const DOCUMENTS_REPOSITORY = Symbol('DOCUMENTS_REPOSITORY');
export const DOCUMENTS_SERVICE = Symbol('DOCUMENTS_SERVICE');

export const DOCUMENTS_QUEUE = {
  NAME: 'documents-queue',
  PROCESSORS: { PROCESS: 'process-documents' },
} as const;

export const DOCUMENTS_EVENTS = {
  CREATED: 'documents.created',
  UPDATED: 'documents.updated',
  DELETED: 'documents.deleted',
} as const;
