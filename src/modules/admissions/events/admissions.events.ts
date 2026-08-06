/**
 * File: admissions.events.ts
 * Module: admissions
 * Purpose: Event payload classes.
 */

import { ADMISSIONS_EVENTS } from '../constants/admissions.constants';

export class AdmissionCreatedEvent {
  public static readonly name = ADMISSIONS_EVENTS.CREATED;
  public constructor(public readonly admissionId: string, public readonly occurredAt = new Date()) {}
}

export class AdmissionUpdatedEvent {
  public static readonly name = ADMISSIONS_EVENTS.UPDATED;
  public constructor(public readonly admissionId: string, public readonly occurredAt = new Date()) {}
}

export class AdmissionDeletedEvent {
  public static readonly name = ADMISSIONS_EVENTS.DELETED;
  public constructor(public readonly admissionId: string, public readonly occurredAt = new Date()) {}
}
