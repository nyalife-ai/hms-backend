/**
 * Consultation domain entity — clinical.consultations (db.sql).
 */

import { randomUUID } from 'crypto';
import { Entity } from '../../../core/domain';
import { ConsultationName } from './value-objects/consultation-name.vo';

export type ConsultationProps = {
  /** Maps to chief_complaint */
  name: ConsultationName;
  /** Maps to notes */
  description?: string;
  patientId: string;
  doctorId: string;
  createdBy: string;
  appointmentId?: string | null;
  status: string;
  consultationType: string;
  priority: string;
  historyPresentIllness?: string | null;
  treatmentPlan?: string | null;
};

export class Consultation extends Entity<string> {
  private props: ConsultationProps;

  private constructor(
    id: string,
    props: ConsultationProps,
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
    createdBy: string;
    appointmentId?: string;
    status?: string;
    consultationType?: string;
    priority?: string;
    historyPresentIllness?: string;
    treatmentPlan?: string;
  }): Consultation {
    const chief = (input.name?.trim() || 'Consultation').slice(0, 255);
    const now = new Date();
    return new Consultation(
      randomUUID(),
      {
        name: ConsultationName.create(chief),
        description: input.description,
        patientId: input.patientId,
        doctorId: input.doctorId,
        createdBy: input.createdBy,
        appointmentId: input.appointmentId,
        status: (input.status || 'IN_PROGRESS').toUpperCase(),
        consultationType: (input.consultationType || 'IN_PERSON').toUpperCase(),
        priority: (input.priority || 'NORMAL').toUpperCase(),
        historyPresentIllness: input.historyPresentIllness,
        treatmentPlan: input.treatmentPlan,
      },
      now,
      now,
    );
  }

  public static reconstitute(
    id: string,
    props: ConsultationProps,
    createdAt: Date,
    updatedAt: Date,
  ): Consultation {
    return new Consultation(id, props, createdAt, updatedAt);
  }

  public update(patch: {
    name?: string;
    description?: string;
    status?: string;
    consultationType?: string;
    priority?: string;
    historyPresentIllness?: string | null;
    treatmentPlan?: string | null;
    appointmentId?: string | null;
  }): void {
    if (patch.name !== undefined) {
      this.props.name = ConsultationName.create(
        patch.name.trim().slice(0, 255) || 'Consultation',
      );
    }
    if (patch.description !== undefined) {
      this.props.description = patch.description;
    }
    if (patch.status !== undefined) {
      this.props.status = patch.status.toUpperCase();
    }
    if (patch.consultationType !== undefined) {
      this.props.consultationType = patch.consultationType.toUpperCase();
    }
    if (patch.priority !== undefined) {
      this.props.priority = patch.priority.toUpperCase();
    }
    if (patch.historyPresentIllness !== undefined) {
      this.props.historyPresentIllness = patch.historyPresentIllness;
    }
    if (patch.treatmentPlan !== undefined) {
      this.props.treatmentPlan = patch.treatmentPlan;
    }
    if (patch.appointmentId !== undefined) {
      this.props.appointmentId = patch.appointmentId;
    }
    this.touch();
  }

  public getName(): ConsultationName {
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
  public getCreatedBy(): string {
    return this.props.createdBy;
  }
  public getAppointmentId(): string | null | undefined {
    return this.props.appointmentId;
  }
  public getStatus(): string {
    return this.props.status;
  }
  public getConsultationType(): string {
    return this.props.consultationType;
  }
  public getPriority(): string {
    return this.props.priority;
  }
  public getHistoryPresentIllness(): string | null | undefined {
    return this.props.historyPresentIllness;
  }
  public getTreatmentPlan(): string | null | undefined {
    return this.props.treatmentPlan;
  }
}
