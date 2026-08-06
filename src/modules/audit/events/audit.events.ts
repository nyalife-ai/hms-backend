/**
 * File: audit.events.ts
 * Module: audit
 * Purpose: Event payload classes.
 */

import { AUDIT_EVENTS } from '../constants/audit.constants';

export class AuditCreatedEvent {
  public static readonly name = AUDIT_EVENTS.CREATED;
  public constructor(public readonly auditId: string, public readonly occurredAt = new Date()) {}
}

export class AuditUpdatedEvent {
  public static readonly name = AUDIT_EVENTS.UPDATED;
  public constructor(public readonly auditId: string, public readonly occurredAt = new Date()) {}
}

export class AuditDeletedEvent {
  public static readonly name = AUDIT_EVENTS.DELETED;
  public constructor(public readonly auditId: string, public readonly occurredAt = new Date()) {}
}
