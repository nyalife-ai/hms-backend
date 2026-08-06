/**
 * Appointment domain entity — clinical.appointments (db.sql).
 */

import { randomUUID } from 'crypto';
import { Entity } from '../../../core/domain';
import { AppointmentName } from './value-objects/appointment-name.vo';

export type AppointmentProps = {
  /** Maps to appointment_type */
  name: AppointmentName;
  /** Maps to reason */
  description?: string;
  patientId: string;
  doctorId: string;
  appointmentDate: Date;
  startTime: Date;
  endTime: Date;
  createdBy: string;
  status: string;
  notes?: string | null;
};

export class Appointment extends Entity<string> {
  private props: AppointmentProps;

  private constructor(
    id: string,
    props: AppointmentProps,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this.props = props;
  }

  public static create(input: {
    name?: string;
    description?: string;
    patientId: string;
    doctorId: string;
    appointmentDate: string | Date;
    startTime: string | Date;
    endTime: string | Date;
    createdBy: string;
    status?: string;
    notes?: string;
  }): Appointment {
    const appointmentDate = toDate(input.appointmentDate, 'appointmentDate');
    const startTime = toDate(input.startTime, 'startTime');
    const endTime = toDate(input.endTime, 'endTime');
    const type = (input.name || 'CONSULTATION').toUpperCase().replace(/[\s-]/g, '_');
    const now = new Date();
    return new Appointment(
      randomUUID(),
      {
        name: AppointmentName.create(type.slice(0, 255) || 'CONSULTATION'),
        description: input.description,
        patientId: input.patientId,
        doctorId: input.doctorId,
        appointmentDate,
        startTime,
        endTime,
        createdBy: input.createdBy,
        status: (input.status || 'SCHEDULED').toUpperCase(),
        notes: input.notes,
      },
      now,
      now,
    );
  }

  public static reconstitute(
    id: string,
    props: AppointmentProps,
    createdAt: Date,
    updatedAt: Date,
  ): Appointment {
    return new Appointment(id, props, createdAt, updatedAt);
  }

  public update(patch: {
    name?: string;
    description?: string;
    appointmentDate?: string | Date;
    startTime?: string | Date;
    endTime?: string | Date;
    status?: string;
    notes?: string | null;
  }): void {
    if (patch.name !== undefined) {
      const type = patch.name.toUpperCase().replace(/[\s-]/g, '_');
      this.props.name = AppointmentName.create(type.slice(0, 255) || 'CONSULTATION');
    }
    if (patch.description !== undefined) {
      this.props.description = patch.description;
    }
    if (patch.appointmentDate !== undefined) {
      this.props.appointmentDate = toDate(patch.appointmentDate, 'appointmentDate');
    }
    if (patch.startTime !== undefined) {
      this.props.startTime = toDate(patch.startTime, 'startTime');
    }
    if (patch.endTime !== undefined) {
      this.props.endTime = toDate(patch.endTime, 'endTime');
    }
    if (patch.status !== undefined) {
      this.props.status = patch.status.toUpperCase();
    }
    if (patch.notes !== undefined) this.props.notes = patch.notes;
    this.touch();
  }

  public getName(): AppointmentName {
    return this.props.name;
  }
  public getDescription(): string | undefined {
    return this.props.description;
  }
  public getPatientId(): string {
    return this.props.patientId;
  }
  public getDoctorId(): string {
    return this.props.doctorId;
  }
  public getAppointmentDate(): Date {
    return this.props.appointmentDate;
  }
  public getStartTime(): Date {
    return this.props.startTime;
  }
  public getEndTime(): Date {
    return this.props.endTime;
  }
  public getCreatedBy(): string {
    return this.props.createdBy;
  }
  public getStatus(): string {
    return this.props.status;
  }
  public getNotes(): string | null | undefined {
    return this.props.notes;
  }
}

function toDate(value: string | Date, field: string): Date {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`${field} must be a valid date/time`);
  }
  return d;
}
