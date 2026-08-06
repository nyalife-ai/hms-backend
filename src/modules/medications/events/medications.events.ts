/**
 * File: medications.events.ts
 * Module: medications
 * Purpose: Event payload classes.
 */

import { MEDICATIONS_EVENTS } from '../constants/medications.constants';

export class MedicationCreatedEvent {
  public static readonly name = MEDICATIONS_EVENTS.CREATED;
  public constructor(public readonly medicationId: string, public readonly occurredAt = new Date()) {}
}

export class MedicationUpdatedEvent {
  public static readonly name = MEDICATIONS_EVENTS.UPDATED;
  public constructor(public readonly medicationId: string, public readonly occurredAt = new Date()) {}
}

export class MedicationDeletedEvent {
  public static readonly name = MEDICATIONS_EVENTS.DELETED;
  public constructor(public readonly medicationId: string, public readonly occurredAt = new Date()) {}
}
