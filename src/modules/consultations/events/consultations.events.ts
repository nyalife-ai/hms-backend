/**
 * File: consultations.events.ts
 * Module: consultations
 * Purpose: Event payload classes.
 */

import { CONSULTATIONS_EVENTS } from '../constants/consultations.constants';

export class ConsultationCreatedEvent {
  public static readonly name = CONSULTATIONS_EVENTS.CREATED;
  public constructor(public readonly consultationId: string, public readonly occurredAt = new Date()) {}
}

export class ConsultationUpdatedEvent {
  public static readonly name = CONSULTATIONS_EVENTS.UPDATED;
  public constructor(public readonly consultationId: string, public readonly occurredAt = new Date()) {}
}

export class ConsultationDeletedEvent {
  public static readonly name = CONSULTATIONS_EVENTS.DELETED;
  public constructor(public readonly consultationId: string, public readonly occurredAt = new Date()) {}
}
