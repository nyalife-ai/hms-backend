/**
 * File: staff.events.ts
 * Module: staff
 * Purpose: Event payload classes.
 */

import { STAFF_EVENTS } from '../constants/staff.constants';

export class StaffCreatedEvent {
  public static readonly name = STAFF_EVENTS.CREATED;
  public constructor(public readonly staffId: string, public readonly occurredAt = new Date()) {}
}

export class StaffUpdatedEvent {
  public static readonly name = STAFF_EVENTS.UPDATED;
  public constructor(public readonly staffId: string, public readonly occurredAt = new Date()) {}
}

export class StaffDeletedEvent {
  public static readonly name = STAFF_EVENTS.DELETED;
  public constructor(public readonly staffId: string, public readonly occurredAt = new Date()) {}
}
