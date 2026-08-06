/**
 * File: vital-signs.events.ts
 * Module: vital-signs
 * Purpose: Event payload classes.
 */

import { VITAL_SIGNS_EVENTS } from '../constants/vital-signs.constants';

export class VitalSignCreatedEvent {
  public static readonly name = VITAL_SIGNS_EVENTS.CREATED;
  public constructor(public readonly vitalSignId: string, public readonly occurredAt = new Date()) {}
}

export class VitalSignUpdatedEvent {
  public static readonly name = VITAL_SIGNS_EVENTS.UPDATED;
  public constructor(public readonly vitalSignId: string, public readonly occurredAt = new Date()) {}
}

export class VitalSignDeletedEvent {
  public static readonly name = VITAL_SIGNS_EVENTS.DELETED;
  public constructor(public readonly vitalSignId: string, public readonly occurredAt = new Date()) {}
}
