/**
 * File: diagnoses.listener.ts
 * Module: diagnoses
 * Purpose: @OnEvent listeners for diagnoses.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DIAGNOSES_EVENTS } from '../constants/diagnoses.constants';
import { DiagnosCreatedEvent, DiagnosDeletedEvent, DiagnosUpdatedEvent } from '../events';

@Injectable()
export class DiagnosesListener {
  private readonly logger = new Logger(DiagnosesListener.name);

  @OnEvent(DIAGNOSES_EVENTS.CREATED)
  onCreated(event: DiagnosCreatedEvent): void {
    this.logger.log(`diagnos created: ${event.diagnosId}`);
  }

  @OnEvent(DIAGNOSES_EVENTS.UPDATED)
  onUpdated(event: DiagnosUpdatedEvent): void {
    this.logger.log(`diagnos updated: ${event.diagnosId}`);
  }

  @OnEvent(DIAGNOSES_EVENTS.DELETED)
  onDeleted(event: DiagnosDeletedEvent): void {
    this.logger.log(`diagnos deleted: ${event.diagnosId}`);
  }
}
