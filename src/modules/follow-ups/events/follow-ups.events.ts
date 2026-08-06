/**
 * File: follow-ups.events.ts
 * Module: follow-ups
 * Purpose: Event payload classes.
 */

import { FOLLOW_UPS_EVENTS } from '../constants/follow-ups.constants';

export class FollowUpCreatedEvent {
  public static readonly name = FOLLOW_UPS_EVENTS.CREATED;
  public constructor(public readonly followUpId: string, public readonly occurredAt = new Date()) {}
}

export class FollowUpUpdatedEvent {
  public static readonly name = FOLLOW_UPS_EVENTS.UPDATED;
  public constructor(public readonly followUpId: string, public readonly occurredAt = new Date()) {}
}

export class FollowUpDeletedEvent {
  public static readonly name = FOLLOW_UPS_EVENTS.DELETED;
  public constructor(public readonly followUpId: string, public readonly occurredAt = new Date()) {}
}
