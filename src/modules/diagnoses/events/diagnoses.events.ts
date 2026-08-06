/**
 * File: diagnoses.events.ts
 * Module: diagnoses
 * Purpose: Event payload classes.
 */

import { DIAGNOSES_EVENTS } from '../constants/diagnoses.constants';

export class DiagnosCreatedEvent {
  public static readonly name = DIAGNOSES_EVENTS.CREATED;
  public constructor(public readonly diagnosId: string, public readonly occurredAt = new Date()) {}
}

export class DiagnosUpdatedEvent {
  public static readonly name = DIAGNOSES_EVENTS.UPDATED;
  public constructor(public readonly diagnosId: string, public readonly occurredAt = new Date()) {}
}

export class DiagnosDeletedEvent {
  public static readonly name = DIAGNOSES_EVENTS.DELETED;
  public constructor(public readonly diagnosId: string, public readonly occurredAt = new Date()) {}
}
