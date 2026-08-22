/**
 * File: notifications.listener.ts
 * Module: notifications
 * Purpose: @OnEvent listeners for notifications.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NOTIFICATIONS_EVENTS } from '../constants/notifications.constants';
import { NotificationCreatedEvent, NotificationDeletedEvent, NotificationUpdatedEvent } from '../events';

@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  @OnEvent(NOTIFICATIONS_EVENTS.CREATED)
  onCreated(event: NotificationCreatedEvent): void {
    this.logger.log(`notification created: ${event.notificationId}`);
  }

  @OnEvent(NOTIFICATIONS_EVENTS.UPDATED)
  onUpdated(event: NotificationUpdatedEvent): void {
    this.logger.log(`notification updated: ${event.notificationId}`);
  }

  @OnEvent(NOTIFICATIONS_EVENTS.DELETED)
  onDeleted(event: NotificationDeletedEvent): void {
    this.logger.log(`notification deleted: ${event.notificationId}`);
  }
}
