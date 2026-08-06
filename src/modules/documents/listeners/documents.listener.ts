/**
 * File: documents.listener.ts
 * Module: documents
 * Purpose: @OnEvent listeners for documents.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DOCUMENTS_EVENTS } from '../constants/documents.constants';
import { DocumentCreatedEvent, DocumentDeletedEvent, DocumentUpdatedEvent } from '../events';

@Injectable()
export class DocumentsListener {
  private readonly logger = new Logger(DocumentsListener.name);

  @OnEvent(DOCUMENTS_EVENTS.CREATED)
  onCreated(event: DocumentCreatedEvent): void {
    this.logger.log(`document created: ${event.documentId}`);
  }

  @OnEvent(DOCUMENTS_EVENTS.UPDATED)
  onUpdated(event: DocumentUpdatedEvent): void {
    this.logger.log(`document updated: ${event.documentId}`);
  }

  @OnEvent(DOCUMENTS_EVENTS.DELETED)
  onDeleted(event: DocumentDeletedEvent): void {
    this.logger.log(`document deleted: ${event.documentId}`);
  }
}
