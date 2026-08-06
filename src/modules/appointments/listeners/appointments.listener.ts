/**
 * File: appointments.listener.ts
 * Module: appointments
 * Purpose: @OnEvent listeners for appointments.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { APPOINTMENTS_EVENTS } from '../constants/appointments.constants';
import { AppointmentCreatedEvent, AppointmentDeletedEvent, AppointmentUpdatedEvent } from '../events';

@Injectable()
export class AppointmentsListener {
  private readonly logger = new Logger(AppointmentsListener.name);

  @OnEvent(APPOINTMENTS_EVENTS.CREATED)
  onCreated(event: AppointmentCreatedEvent): void {
    this.logger.log(`appointment created: ${event.appointmentId}`);
  }

  @OnEvent(APPOINTMENTS_EVENTS.UPDATED)
  onUpdated(event: AppointmentUpdatedEvent): void {
    this.logger.log(`appointment updated: ${event.appointmentId}`);
  }

  @OnEvent(APPOINTMENTS_EVENTS.DELETED)
  onDeleted(event: AppointmentDeletedEvent): void {
    this.logger.log(`appointment deleted: ${event.appointmentId}`);
  }
}
