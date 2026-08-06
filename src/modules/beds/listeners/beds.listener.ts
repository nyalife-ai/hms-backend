/**
 * File: beds.listener.ts
 * Module: beds
 * Purpose: @OnEvent listeners for beds.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BEDS_EVENTS } from '../constants/beds.constants';
import { BedCreatedEvent, BedDeletedEvent, BedUpdatedEvent } from '../events';

@Injectable()
export class BedsListener {
  private readonly logger = new Logger(BedsListener.name);

  @OnEvent(BEDS_EVENTS.CREATED)
  onCreated(event: BedCreatedEvent): void {
    this.logger.log(`bed created: ${event.bedId}`);
  }

  @OnEvent(BEDS_EVENTS.UPDATED)
  onUpdated(event: BedUpdatedEvent): void {
    this.logger.log(`bed updated: ${event.bedId}`);
  }

  @OnEvent(BEDS_EVENTS.DELETED)
  onDeleted(event: BedDeletedEvent): void {
    this.logger.log(`bed deleted: ${event.bedId}`);
  }
}
