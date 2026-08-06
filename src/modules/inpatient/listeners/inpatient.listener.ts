/**
 * File: inpatient.listener.ts
 * Module: inpatient
 * Purpose: @OnEvent listeners for inpatient.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { INPATIENT_EVENTS } from '../constants/inpatient.constants';
import { InpatientCreatedEvent, InpatientDeletedEvent, InpatientUpdatedEvent } from '../events';

@Injectable()
export class InpatientListener {
  private readonly logger = new Logger(InpatientListener.name);

  @OnEvent(INPATIENT_EVENTS.CREATED)
  onCreated(event: InpatientCreatedEvent): void {
    this.logger.log(`inpatient created: ${event.inpatientId}`);
  }

  @OnEvent(INPATIENT_EVENTS.UPDATED)
  onUpdated(event: InpatientUpdatedEvent): void {
    this.logger.log(`inpatient updated: ${event.inpatientId}`);
  }

  @OnEvent(INPATIENT_EVENTS.DELETED)
  onDeleted(event: InpatientDeletedEvent): void {
    this.logger.log(`inpatient deleted: ${event.inpatientId}`);
  }
}
