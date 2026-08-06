/**
 * File: documents.events.ts
 * Module: documents
 * Purpose: Event payload classes.
 */

import { DOCUMENTS_EVENTS } from '../constants/documents.constants';

export class DocumentCreatedEvent {
  public static readonly name = DOCUMENTS_EVENTS.CREATED;
  public constructor(public readonly documentId: string, public readonly occurredAt = new Date()) {}
}

export class DocumentUpdatedEvent {
  public static readonly name = DOCUMENTS_EVENTS.UPDATED;
  public constructor(public readonly documentId: string, public readonly occurredAt = new Date()) {}
}

export class DocumentDeletedEvent {
  public static readonly name = DOCUMENTS_EVENTS.DELETED;
  public constructor(public readonly documentId: string, public readonly occurredAt = new Date()) {}
}
