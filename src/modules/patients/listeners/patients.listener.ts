/**
 * File: patients.listener.ts
 * Module: patients
 * Purpose: @OnEvent listeners for patients.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PATIENTS_EVENTS } from '../constants/patients.constants';
import { PatientCreatedEvent, PatientDeletedEvent, PatientUpdatedEvent } from '../events';

@Injectable()
export class PatientsListener {
  private readonly logger = new Logger(PatientsListener.name);

  @OnEvent(PATIENTS_EVENTS.CREATED)
  onCreated(event: PatientCreatedEvent): void {
    this.logger.log(`patient created: ${event.patientId}`);
  }

  @OnEvent(PATIENTS_EVENTS.UPDATED)
  onUpdated(event: PatientUpdatedEvent): void {
    this.logger.log(`patient updated: ${event.patientId}`);
  }

  @OnEvent(PATIENTS_EVENTS.DELETED)
  onDeleted(event: PatientDeletedEvent): void {
    this.logger.log(`patient deleted: ${event.patientId}`);
  }
}
