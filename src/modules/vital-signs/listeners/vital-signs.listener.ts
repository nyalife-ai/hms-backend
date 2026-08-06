/**
 * File: vital-signs.listener.ts
 * Module: vital-signs
 * Purpose: @OnEvent listeners for vital-signs.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { VITAL_SIGNS_EVENTS } from '../constants/vital-signs.constants';
import { VitalSignCreatedEvent, VitalSignDeletedEvent, VitalSignUpdatedEvent } from '../events';

@Injectable()
export class VitalSignsListener {
  private readonly logger = new Logger(VitalSignsListener.name);

  @OnEvent(VITAL_SIGNS_EVENTS.CREATED)
  onCreated(event: VitalSignCreatedEvent): void {
    this.logger.log(`vital-sign created: ${event.vitalSignId}`);
  }

  @OnEvent(VITAL_SIGNS_EVENTS.UPDATED)
  onUpdated(event: VitalSignUpdatedEvent): void {
    this.logger.log(`vital-sign updated: ${event.vitalSignId}`);
  }

  @OnEvent(VITAL_SIGNS_EVENTS.DELETED)
  onDeleted(event: VitalSignDeletedEvent): void {
    this.logger.log(`vital-sign deleted: ${event.vitalSignId}`);
  }
}
