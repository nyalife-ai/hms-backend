/**
 * File: inpatient.events.ts
 * Module: inpatient
 * Purpose: Event payload classes.
 */

import { INPATIENT_EVENTS } from '../constants/inpatient.constants';

export class InpatientCreatedEvent {
  public static readonly name = INPATIENT_EVENTS.CREATED;
  public constructor(public readonly inpatientId: string, public readonly occurredAt = new Date()) {}
}

export class InpatientUpdatedEvent {
  public static readonly name = INPATIENT_EVENTS.UPDATED;
  public constructor(public readonly inpatientId: string, public readonly occurredAt = new Date()) {}
}

export class InpatientDeletedEvent {
  public static readonly name = INPATIENT_EVENTS.DELETED;
  public constructor(public readonly inpatientId: string, public readonly occurredAt = new Date()) {}
}
