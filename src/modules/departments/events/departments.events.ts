/**
 * File: departments.events.ts
 * Module: departments
 * Purpose: Event payload classes.
 */

import { DEPARTMENTS_EVENTS } from '../constants/departments.constants';

export class DepartmentCreatedEvent {
  public static readonly name = DEPARTMENTS_EVENTS.CREATED;
  public constructor(public readonly departmentId: string, public readonly occurredAt = new Date()) {}
}

export class DepartmentUpdatedEvent {
  public static readonly name = DEPARTMENTS_EVENTS.UPDATED;
  public constructor(public readonly departmentId: string, public readonly occurredAt = new Date()) {}
}

export class DepartmentDeletedEvent {
  public static readonly name = DEPARTMENTS_EVENTS.DELETED;
  public constructor(public readonly departmentId: string, public readonly occurredAt = new Date()) {}
}
