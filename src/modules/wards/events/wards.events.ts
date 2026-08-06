/**
 * File: wards.events.ts
 * Module: wards
 * Purpose: Event payload classes.
 */

import { WARDS_EVENTS } from '../constants/wards.constants';

export class WardCreatedEvent {
  public static readonly name = WARDS_EVENTS.CREATED;
  public constructor(public readonly wardId: string, public readonly occurredAt = new Date()) {}
}

export class WardUpdatedEvent {
  public static readonly name = WARDS_EVENTS.UPDATED;
  public constructor(public readonly wardId: string, public readonly occurredAt = new Date()) {}
}

export class WardDeletedEvent {
  public static readonly name = WARDS_EVENTS.DELETED;
  public constructor(public readonly wardId: string, public readonly occurredAt = new Date()) {}
}
