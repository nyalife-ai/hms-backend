/**
 * File: medications.listener.ts
 * Module: medications
 * Purpose: @OnEvent listeners for medications.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MEDICATIONS_EVENTS } from '../constants/medications.constants';
import { MedicationCreatedEvent, MedicationDeletedEvent, MedicationUpdatedEvent } from '../events';

@Injectable()
export class MedicationsListener {
  private readonly logger = new Logger(MedicationsListener.name);

  @OnEvent(MEDICATIONS_EVENTS.CREATED)
  onCreated(event: MedicationCreatedEvent): void {
    this.logger.log(`medication created: ${event.medicationId}`);
  }

  @OnEvent(MEDICATIONS_EVENTS.UPDATED)
  onUpdated(event: MedicationUpdatedEvent): void {
    this.logger.log(`medication updated: ${event.medicationId}`);
  }

  @OnEvent(MEDICATIONS_EVENTS.DELETED)
  onDeleted(event: MedicationDeletedEvent): void {
    this.logger.log(`medication deleted: ${event.medicationId}`);
  }
}
