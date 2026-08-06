/**
 * File: appointments.events.ts
 * Module: appointments
 * Purpose: Event payload classes.
 */

import { APPOINTMENTS_EVENTS } from '../constants/appointments.constants';

export class AppointmentCreatedEvent {
  public static readonly name = APPOINTMENTS_EVENTS.CREATED;
  public constructor(public readonly appointmentId: string, public readonly occurredAt = new Date()) {}
}

export class AppointmentUpdatedEvent {
  public static readonly name = APPOINTMENTS_EVENTS.UPDATED;
  public constructor(public readonly appointmentId: string, public readonly occurredAt = new Date()) {}
}

export class AppointmentDeletedEvent {
  public static readonly name = APPOINTMENTS_EVENTS.DELETED;
  public constructor(public readonly appointmentId: string, public readonly occurredAt = new Date()) {}
}
