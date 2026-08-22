/**
 * File: notifications.events.ts
 * Module: notifications
 * Purpose: Event payload classes.
 */

import { NOTIFICATIONS_EVENTS } from '../constants/notifications.constants';

export class NotificationCreatedEvent {
  public static readonly name = NOTIFICATIONS_EVENTS.CREATED;
  public constructor(public readonly notificationId: string, public readonly occurredAt = new Date()) {}
}

export class NotificationUpdatedEvent {
  public static readonly name = NOTIFICATIONS_EVENTS.UPDATED;
  public constructor(public readonly notificationId: string, public readonly occurredAt = new Date()) {}
}

export class NotificationDeletedEvent {
  public static readonly name = NOTIFICATIONS_EVENTS.DELETED;
  public constructor(public readonly notificationId: string, public readonly occurredAt = new Date()) {}
}
