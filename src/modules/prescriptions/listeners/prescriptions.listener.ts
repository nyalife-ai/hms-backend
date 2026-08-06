/**
 * File: prescriptions.listener.ts
 * Module: prescriptions
 * Purpose: @OnEvent listeners for prescriptions.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PRESCRIPTIONS_EVENTS } from '../constants/prescriptions.constants';
import { PrescriptionCreatedEvent, PrescriptionDeletedEvent, PrescriptionUpdatedEvent } from '../events';

@Injectable()
export class PrescriptionsListener {
  private readonly logger = new Logger(PrescriptionsListener.name);

  @OnEvent(PRESCRIPTIONS_EVENTS.CREATED)
  onCreated(event: PrescriptionCreatedEvent): void {
    this.logger.log(`prescription created: ${event.prescriptionId}`);
  }

  @OnEvent(PRESCRIPTIONS_EVENTS.UPDATED)
  onUpdated(event: PrescriptionUpdatedEvent): void {
    this.logger.log(`prescription updated: ${event.prescriptionId}`);
  }

  @OnEvent(PRESCRIPTIONS_EVENTS.DELETED)
  onDeleted(event: PrescriptionDeletedEvent): void {
    this.logger.log(`prescription deleted: ${event.prescriptionId}`);
  }
}
