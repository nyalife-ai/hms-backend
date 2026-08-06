/**
 * File: laboratory.events.ts
 * Module: laboratory
 * Purpose: Event payload classes.
 */

import { LABORATORY_EVENTS } from '../constants/laboratory.constants';

export class LaboratoryCreatedEvent {
  public static readonly name = LABORATORY_EVENTS.CREATED;
  public constructor(public readonly laboratoryId: string, public readonly occurredAt = new Date()) {}
}

export class LaboratoryUpdatedEvent {
  public static readonly name = LABORATORY_EVENTS.UPDATED;
  public constructor(public readonly laboratoryId: string, public readonly occurredAt = new Date()) {}
}

export class LaboratoryDeletedEvent {
  public static readonly name = LABORATORY_EVENTS.DELETED;
  public constructor(public readonly laboratoryId: string, public readonly occurredAt = new Date()) {}
}
