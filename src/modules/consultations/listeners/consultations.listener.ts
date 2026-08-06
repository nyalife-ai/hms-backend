/**
 * File: consultations.listener.ts
 * Module: consultations
 * Purpose: @OnEvent listeners for consultations.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CONSULTATIONS_EVENTS } from '../constants/consultations.constants';
import { ConsultationCreatedEvent, ConsultationDeletedEvent, ConsultationUpdatedEvent } from '../events';

@Injectable()
export class ConsultationsListener {
  private readonly logger = new Logger(ConsultationsListener.name);

  @OnEvent(CONSULTATIONS_EVENTS.CREATED)
  onCreated(event: ConsultationCreatedEvent): void {
    this.logger.log(`consultation created: ${event.consultationId}`);
  }

  @OnEvent(CONSULTATIONS_EVENTS.UPDATED)
  onUpdated(event: ConsultationUpdatedEvent): void {
    this.logger.log(`consultation updated: ${event.consultationId}`);
  }

  @OnEvent(CONSULTATIONS_EVENTS.DELETED)
  onDeleted(event: ConsultationDeletedEvent): void {
    this.logger.log(`consultation deleted: ${event.consultationId}`);
  }
}
