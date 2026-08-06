/**
 * File: radiology.listener.ts
 * Module: radiology
 * Purpose: @OnEvent listeners for radiology.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RADIOLOGY_EVENTS } from '../constants/radiology.constants';
import { RadiologyCreatedEvent, RadiologyDeletedEvent, RadiologyUpdatedEvent } from '../events';

@Injectable()
export class RadiologyListener {
  private readonly logger = new Logger(RadiologyListener.name);

  @OnEvent(RADIOLOGY_EVENTS.CREATED)
  onCreated(event: RadiologyCreatedEvent): void {
    this.logger.log(`radiology created: ${event.radiologyId}`);
  }

  @OnEvent(RADIOLOGY_EVENTS.UPDATED)
  onUpdated(event: RadiologyUpdatedEvent): void {
    this.logger.log(`radiology updated: ${event.radiologyId}`);
  }

  @OnEvent(RADIOLOGY_EVENTS.DELETED)
  onDeleted(event: RadiologyDeletedEvent): void {
    this.logger.log(`radiology deleted: ${event.radiologyId}`);
  }
}
