/**
 * File: beds.events.ts
 * Module: beds
 * Purpose: Event payload classes.
 */

import { BEDS_EVENTS } from '../constants/beds.constants';

export class BedCreatedEvent {
  public static readonly name = BEDS_EVENTS.CREATED;
  public constructor(public readonly bedId: string, public readonly occurredAt = new Date()) {}
}

export class BedUpdatedEvent {
  public static readonly name = BEDS_EVENTS.UPDATED;
  public constructor(public readonly bedId: string, public readonly occurredAt = new Date()) {}
}

export class BedDeletedEvent {
  public static readonly name = BEDS_EVENTS.DELETED;
  public constructor(public readonly bedId: string, public readonly occurredAt = new Date()) {}
}
