/**
 * Prescription domain entity — pharmacy.prescriptions (db.sql).
 */

import { randomUUID } from 'crypto';
import { Entity } from '../../../core/domain';
import { PrescriptionName } from './value-objects/prescription-name.vo';

export type PrescriptionProps = {
  /** Maps to prescription_number (or notes fallback for display) */
  name: PrescriptionName;
  /** Maps to notes */
  description?: string;
  patientId: string;
  prescribedBy: string;
  consultationId?: string | null;
  status: string;
  isVoided: boolean;
};

export class Prescription extends Entity<string> {
  private props: PrescriptionProps;

  private constructor(
    id: string,
    props: PrescriptionProps,
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
    prescribedBy: string;
    consultationId?: string;
    status?: string;
  }): Prescription {
    const label =
      (input.name?.trim() ||
        input.description?.trim() ||
        `RX-${Date.now()}`).slice(0, 255);
    const now = new Date();
    return new Prescription(
      randomUUID(),
      {
        name: PrescriptionName.create(label),
        description: input.description,
        patientId: input.patientId,
        prescribedBy: input.prescribedBy,
        consultationId: input.consultationId,
        status: (input.status || 'PENDING').toUpperCase(),
        isVoided: false,
      },
      now,
      now,
    );
  }

  public static reconstitute(
    id: string,
    props: PrescriptionProps,
    createdAt: Date,
    updatedAt: Date,
  ): Prescription {
    return new Prescription(id, props, createdAt, updatedAt);
  }

  public update(patch: {
    name?: string;
    description?: string;
    status?: string;
    consultationId?: string | null;
    isVoided?: boolean;
  }): void {
    if (patch.name !== undefined) {
      this.props.name = PrescriptionName.create(
        patch.name.trim().slice(0, 255) || 'Prescription',
      );
    }
    if (patch.description !== undefined) {
      this.props.description = patch.description;
    }
    if (patch.status !== undefined) {
      this.props.status = patch.status.toUpperCase();
    }
    if (patch.consultationId !== undefined) {
      this.props.consultationId = patch.consultationId;
    }
    if (patch.isVoided !== undefined) this.props.isVoided = patch.isVoided;
    this.touch();
  }

  public getName(): PrescriptionName {
    return this.props.name;
  }
  public getDescription(): string | undefined {
    return this.props.description;
  }
  public getPatientId(): string {
    return this.props.patientId;
  }
  public getPrescribedBy(): string {
    return this.props.prescribedBy;
  }
  public getConsultationId(): string | null | undefined {
    return this.props.consultationId;
  }
  public getStatus(): string {
    return this.props.status;
  }
  public getIsVoided(): boolean {
    return this.props.isVoided;
  }
}
