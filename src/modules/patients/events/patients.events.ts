/**
 * File: patients.events.ts
 * Module: patients
 * Purpose: Event payload classes.
 */

import { PATIENTS_EVENTS } from '../constants/patients.constants';

export class PatientCreatedEvent {
  public static readonly name = PATIENTS_EVENTS.CREATED;
  public constructor(public readonly patientId: string, public readonly occurredAt = new Date()) {}
}

export class PatientUpdatedEvent {
  public static readonly name = PATIENTS_EVENTS.UPDATED;
  public constructor(public readonly patientId: string, public readonly occurredAt = new Date()) {}
}

export class PatientDeletedEvent {
  public static readonly name = PATIENTS_EVENTS.DELETED;
  public constructor(public readonly patientId: string, public readonly occurredAt = new Date()) {}
}
