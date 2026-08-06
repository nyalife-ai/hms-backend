/**
 * File: wards.listener.ts
 * Module: wards
 * Purpose: @OnEvent listeners for wards.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WARDS_EVENTS } from '../constants/wards.constants';
import { WardCreatedEvent, WardDeletedEvent, WardUpdatedEvent } from '../events';

@Injectable()
export class WardsListener {
  private readonly logger = new Logger(WardsListener.name);

  @OnEvent(WARDS_EVENTS.CREATED)
  onCreated(event: WardCreatedEvent): void {
    this.logger.log(`ward created: ${event.wardId}`);
  }

  @OnEvent(WARDS_EVENTS.UPDATED)
  onUpdated(event: WardUpdatedEvent): void {
    this.logger.log(`ward updated: ${event.wardId}`);
  }

  @OnEvent(WARDS_EVENTS.DELETED)
  onDeleted(event: WardDeletedEvent): void {
    this.logger.log(`ward deleted: ${event.wardId}`);
  }
}
