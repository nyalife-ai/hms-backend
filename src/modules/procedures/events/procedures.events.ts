/**
 * File: procedures.events.ts
 * Module: procedures
 * Purpose: Event payload classes.
 */

import { PROCEDURES_EVENTS } from '../constants/procedures.constants';

export class ProcedureCreatedEvent {
  public static readonly name = PROCEDURES_EVENTS.CREATED;
  public constructor(public readonly procedureId: string, public readonly occurredAt = new Date()) {}
}

export class ProcedureUpdatedEvent {
  public static readonly name = PROCEDURES_EVENTS.UPDATED;
  public constructor(public readonly procedureId: string, public readonly occurredAt = new Date()) {}
}

export class ProcedureDeletedEvent {
  public static readonly name = PROCEDURES_EVENTS.DELETED;
  public constructor(public readonly procedureId: string, public readonly occurredAt = new Date()) {}
}
