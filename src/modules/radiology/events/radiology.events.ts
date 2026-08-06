/**
 * File: radiology.events.ts
 * Module: radiology
 * Purpose: Event payload classes.
 */

import { RADIOLOGY_EVENTS } from '../constants/radiology.constants';

export class RadiologyCreatedEvent {
  public static readonly name = RADIOLOGY_EVENTS.CREATED;
  public constructor(public readonly radiologyId: string, public readonly occurredAt = new Date()) {}
}

export class RadiologyUpdatedEvent {
  public static readonly name = RADIOLOGY_EVENTS.UPDATED;
  public constructor(public readonly radiologyId: string, public readonly occurredAt = new Date()) {}
}

export class RadiologyDeletedEvent {
  public static readonly name = RADIOLOGY_EVENTS.DELETED;
  public constructor(public readonly radiologyId: string, public readonly occurredAt = new Date()) {}
}
