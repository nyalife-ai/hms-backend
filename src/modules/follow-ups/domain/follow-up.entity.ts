/**
 * FollowUp domain entity — clinical.follow_ups.
 */

import { randomUUID } from 'crypto';
import { Entity } from '../../../core/domain';
import { FollowUpName } from './value-objects/follow-up-name.vo';

export type FollowUpProps = {
  name: FollowUpName;
  description?: string;
  patientId: string;
  consultationId: string;
  followUpDate: Date;
  followUpType?: string | null;
  reason: string;
  status: string;
  notes?: string | null;
  createdBy: string;
};

export class FollowUp extends Entity<string> {
  private props: FollowUpProps;

  private constructor(
    id: string,
    props: FollowUpProps,
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
    consultationId: string;
    followUpDate: Date | string;
    followUpType?: string;
    reason: string;
    status?: string;
    notes?: string;
    createdBy: string;
  }): FollowUp {
    const now = new Date();
    const reason = input.reason.trim();
    const label =
      input.name?.trim() ||
      input.followUpType?.trim() ||
      reason.slice(0, 255);
    return new FollowUp(
      randomUUID(),
      {
        name: FollowUpName.create(label || 'Follow-up'),
        description: input.description ?? input.notes,
        patientId: input.patientId,
        consultationId: input.consultationId,
        followUpDate: new Date(input.followUpDate),
        followUpType: input.followUpType ?? null,
        reason,
        status: (input.status || 'SCHEDULED').toUpperCase(),
        notes: input.notes ?? input.description ?? null,
        createdBy: input.createdBy,
      },
      now,
      now,
    );
  }

  public static reconstitute(
    id: string,
    props: FollowUpProps,
    createdAt: Date,
    updatedAt: Date,
  ): FollowUp {
    return new FollowUp(id, props, createdAt, updatedAt);
  }

  public update(patch: {
    name?: string;
    description?: string;
    followUpDate?: Date | string;
    followUpType?: string | null;
    reason?: string;
    status?: string;
    notes?: string | null;
  }): void {
    if (patch.followUpDate !== undefined) {
      this.props.followUpDate = new Date(patch.followUpDate);
    }
    if (patch.followUpType !== undefined) {
      this.props.followUpType = patch.followUpType;
    }
    if (patch.reason !== undefined) {
      this.props.reason = patch.reason.trim();
    }
    if (patch.status !== undefined) {
      this.props.status = patch.status.toUpperCase();
    }
    if (patch.notes !== undefined) this.props.notes = patch.notes;
    if (patch.description !== undefined) {
      this.props.description = patch.description;
      this.props.notes = patch.description;
    }
    if (patch.name !== undefined) {
      this.props.name = FollowUpName.create(patch.name);
    } else if (patch.reason || patch.followUpType) {
      const label =
        this.props.followUpType?.trim() ||
        this.props.reason.slice(0, 255) ||
        'Follow-up';
      this.props.name = FollowUpName.create(label);
    }
    this.touch();
  }

  public getName(): FollowUpName {
    return this.props.name;
  }
  public getDescription(): string | undefined {
    return this.props.description ?? this.props.notes ?? undefined;
  }
  public getPatientId(): string {
    return this.props.patientId;
  }
  public getConsultationId(): string {
    return this.props.consultationId;
  }
  public getFollowUpDate(): Date {
    return this.props.followUpDate;
  }
  public getFollowUpType(): string | null | undefined {
    return this.props.followUpType;
  }
  public getReason(): string {
    return this.props.reason;
  }
  public getStatus(): string {
    return this.props.status;
  }
  public getNotes(): string | null | undefined {
    return this.props.notes;
  }
  public getCreatedBy(): string {
    return this.props.createdBy;
  }
}
