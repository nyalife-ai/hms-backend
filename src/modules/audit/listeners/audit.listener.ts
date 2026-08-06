/**
 * File: audit.listener.ts
 * Module: audit
 * Purpose: @OnEvent listeners for audit.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AUDIT_EVENTS } from '../constants/audit.constants';
import { AuditCreatedEvent, AuditDeletedEvent, AuditUpdatedEvent } from '../events';

@Injectable()
export class AuditListener {
  private readonly logger = new Logger(AuditListener.name);

  @OnEvent(AUDIT_EVENTS.CREATED)
  onCreated(event: AuditCreatedEvent): void {
    this.logger.log(`audit created: ${event.auditId}`);
  }

  @OnEvent(AUDIT_EVENTS.UPDATED)
  onUpdated(event: AuditUpdatedEvent): void {
    this.logger.log(`audit updated: ${event.auditId}`);
  }

  @OnEvent(AUDIT_EVENTS.DELETED)
  onDeleted(event: AuditDeletedEvent): void {
    this.logger.log(`audit deleted: ${event.auditId}`);
  }
}
