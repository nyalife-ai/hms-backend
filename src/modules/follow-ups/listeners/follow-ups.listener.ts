/**
 * File: follow-ups.listener.ts
 * Module: follow-ups
 * Purpose: @OnEvent listeners for follow-ups.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { FOLLOW_UPS_EVENTS } from '../constants/follow-ups.constants';
import { FollowUpCreatedEvent, FollowUpDeletedEvent, FollowUpUpdatedEvent } from '../events';

@Injectable()
export class FollowUpsListener {
  private readonly logger = new Logger(FollowUpsListener.name);

  @OnEvent(FOLLOW_UPS_EVENTS.CREATED)
  onCreated(event: FollowUpCreatedEvent): void {
    this.logger.log(`follow-up created: ${event.followUpId}`);
  }

  @OnEvent(FOLLOW_UPS_EVENTS.UPDATED)
  onUpdated(event: FollowUpUpdatedEvent): void {
    this.logger.log(`follow-up updated: ${event.followUpId}`);
  }

  @OnEvent(FOLLOW_UPS_EVENTS.DELETED)
  onDeleted(event: FollowUpDeletedEvent): void {
    this.logger.log(`follow-up deleted: ${event.followUpId}`);
  }
}
