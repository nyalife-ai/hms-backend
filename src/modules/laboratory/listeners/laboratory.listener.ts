/**
 * File: laboratory.listener.ts
 * Module: laboratory
 * Purpose: @OnEvent listeners for laboratory.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { LABORATORY_EVENTS } from '../constants/laboratory.constants';
import { LaboratoryCreatedEvent, LaboratoryDeletedEvent, LaboratoryUpdatedEvent } from '../events';
import { LAB_EVENTS } from '../use-cases/lab-journey.usecase';

@Injectable()
export class LaboratoryListener {
  private readonly logger = new Logger(LaboratoryListener.name);

  @OnEvent(LABORATORY_EVENTS.CREATED)
  onCreated(event: LaboratoryCreatedEvent): void {
    this.logger.log(`laboratory created: ${event.laboratoryId}`);
  }

  @OnEvent(LABORATORY_EVENTS.UPDATED)
  onUpdated(event: LaboratoryUpdatedEvent): void {
    this.logger.log(`laboratory updated: ${event.laboratoryId}`);
  }

  @OnEvent(LABORATORY_EVENTS.DELETED)
  onDeleted(event: LaboratoryDeletedEvent): void {
    this.logger.log(`laboratory deleted: ${event.laboratoryId}`);
  }

  @OnEvent(LAB_EVENTS.RESULT_CRITICAL)
  onCritical(payload: {
    requestId: string;
    resultId: string;
    parameterId?: string;
  }): void {
    this.logger.warn(
      `CRITICAL lab result ${payload.resultId} on request ${payload.requestId}` +
        (payload.parameterId ? ` (parameter ${payload.parameterId})` : ''),
    );
  }

  @OnEvent(LAB_EVENTS.RESULT_RELEASED)
  onReleased(payload: {
    requestId: string;
    visitId: string | null;
    releasedAt: string;
  }): void {
    this.logger.log(
      `Lab results released to doctor: request=${payload.requestId}` +
        (payload.visitId ? ` visit=${payload.visitId}` : '') +
        ` at=${payload.releasedAt}`,
    );
  }
}
