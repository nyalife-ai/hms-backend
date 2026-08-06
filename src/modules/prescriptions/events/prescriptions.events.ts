/**
 * File: prescriptions.events.ts
 * Module: prescriptions
 * Purpose: Event payload classes.
 */

import { PRESCRIPTIONS_EVENTS } from '../constants/prescriptions.constants';

export class PrescriptionCreatedEvent {
  public static readonly name = PRESCRIPTIONS_EVENTS.CREATED;
  public constructor(public readonly prescriptionId: string, public readonly occurredAt = new Date()) {}
}

export class PrescriptionUpdatedEvent {
  public static readonly name = PRESCRIPTIONS_EVENTS.UPDATED;
  public constructor(public readonly prescriptionId: string, public readonly occurredAt = new Date()) {}
}

export class PrescriptionDeletedEvent {
  public static readonly name = PRESCRIPTIONS_EVENTS.DELETED;
  public constructor(public readonly prescriptionId: string, public readonly occurredAt = new Date()) {}
}
