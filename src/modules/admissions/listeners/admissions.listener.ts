/**
 * File: admissions.listener.ts
 * Module: admissions
 * Purpose: @OnEvent listeners for admissions.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ADMISSIONS_EVENTS } from '../constants/admissions.constants';
import { AdmissionCreatedEvent, AdmissionDeletedEvent, AdmissionUpdatedEvent } from '../events';

@Injectable()
export class AdmissionsListener {
  private readonly logger = new Logger(AdmissionsListener.name);

  @OnEvent(ADMISSIONS_EVENTS.CREATED)
  onCreated(event: AdmissionCreatedEvent): void {
    this.logger.log(`admission created: ${event.admissionId}`);
  }

  @OnEvent(ADMISSIONS_EVENTS.UPDATED)
  onUpdated(event: AdmissionUpdatedEvent): void {
    this.logger.log(`admission updated: ${event.admissionId}`);
  }

  @OnEvent(ADMISSIONS_EVENTS.DELETED)
  onDeleted(event: AdmissionDeletedEvent): void {
    this.logger.log(`admission deleted: ${event.admissionId}`);
  }
}
