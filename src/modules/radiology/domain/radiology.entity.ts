/**
 * Radiology domain entity — radiology.requests (RadiologyRequests).
 */

import { randomUUID } from 'crypto';
import { Entity } from '../../../core/domain';
import { RadiologyName } from './value-objects/radiology-name.vo';

export type RadiologyProps = {
  /** Maps to request_number. */
  name: RadiologyName;
  /** Maps to clinical_indication. */
  description?: string;
  patientId: string;
  scanTypeId: string;
  requestedBy: string;
  requestingDoctorId?: string | null;
  consultationId?: string | null;
  priority: string;
  status: string;
};

export class Radiology extends Entity<string> {
  private props: RadiologyProps;

  private constructor(
    id: string,
    props: RadiologyProps,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this.props = props;
  }

  public static create(input: {
    name: string;
    description?: string;
    patientId: string;
    scanTypeId: string;
    requestedBy: string;
    requestingDoctorId?: string;
    consultationId?: string;
    priority?: string;
    status?: string;
  }): Radiology {
    const now = new Date();
    return new Radiology(
      randomUUID(),
      {
        name: RadiologyName.create(input.name.trim().slice(0, 50) || 'RAD-REQ'),
        description: input.description,
        patientId: input.patientId,
        scanTypeId: input.scanTypeId,
        requestedBy: input.requestedBy,
        requestingDoctorId: input.requestingDoctorId ?? null,
        consultationId: input.consultationId ?? null,
        priority: (input.priority || 'ROUTINE').toUpperCase(),
        status: (input.status || 'PENDING').toUpperCase(),
      },
      now,
      now,
    );
  }

  public static reconstitute(
    id: string,
    props: RadiologyProps,
    createdAt: Date,
    updatedAt: Date,
  ): Radiology {
    return new Radiology(id, props, createdAt, updatedAt);
  }

  public update(patch: {
    name?: string;
    description?: string;
    requestingDoctorId?: string | null;
    consultationId?: string | null;
    priority?: string;
    status?: string;
    scanTypeId?: string;
  }): void {
    if (patch.name !== undefined) {
      this.props.name = RadiologyName.create(patch.name.trim().slice(0, 50));
    }
    if (patch.description !== undefined) {
      this.props.description = patch.description;
    }
    if (patch.requestingDoctorId !== undefined) {
      this.props.requestingDoctorId = patch.requestingDoctorId;
    }
    if (patch.consultationId !== undefined) {
      this.props.consultationId = patch.consultationId;
    }
    if (patch.priority !== undefined) {
      this.props.priority = patch.priority.toUpperCase();
    }
    if (patch.status !== undefined) {
      this.props.status = patch.status.toUpperCase();
    }
    if (patch.scanTypeId !== undefined) {
      this.props.scanTypeId = patch.scanTypeId;
    }
    this.touch();
  }

  public getName(): RadiologyName {
    return this.props.name;
  }
  public getDescription(): string | undefined {
    return this.props.description;
  }
  public getPatientId(): string {
    return this.props.patientId;
  }
  public getScanTypeId(): string {
    return this.props.scanTypeId;
  }
  public getRequestedBy(): string {
    return this.props.requestedBy;
  }
  public getRequestingDoctorId(): string | null | undefined {
    return this.props.requestingDoctorId;
  }
  public getConsultationId(): string | null | undefined {
    return this.props.consultationId;
  }
  public getPriority(): string {
    return this.props.priority;
  }
  public getStatus(): string {
    return this.props.status;
  }
}
