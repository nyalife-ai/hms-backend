/**
 * Procedure domain entity — clinical.procedures.
 */

import { randomUUID } from 'crypto';
import { Entity } from '../../../core/domain';
import { ProcedureName } from './value-objects/procedure-name.vo';

export type ProcedureProps = {
  name: ProcedureName;
  description: string;
  consultationId: string;
  patientId: string;
  cptCode?: string | null;
  performerId?: string | null;
  outcome?: string | null;
  performedAt?: Date | null;
};

export class Procedure extends Entity<string> {
  private props: ProcedureProps;

  private constructor(
    id: string,
    props: ProcedureProps,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this.props = props;
  }

  public static create(input: {
    name?: string;
    description: string;
    consultationId: string;
    patientId: string;
    cptCode?: string;
    performerId?: string;
    outcome?: string;
    performedAt?: Date | string | null;
  }): Procedure {
    const now = new Date();
    const description = input.description.trim();
    const label =
      input.name?.trim() ||
      input.cptCode?.trim() ||
      description.slice(0, 255);
    return new Procedure(
      randomUUID(),
      {
        name: ProcedureName.create(label || 'Procedure'),
        description,
        consultationId: input.consultationId,
        patientId: input.patientId,
        cptCode: input.cptCode ?? null,
        performerId: input.performerId ?? null,
        outcome: input.outcome ?? null,
        performedAt: input.performedAt ? new Date(input.performedAt) : now,
      },
      now,
      now,
    );
  }

  public static reconstitute(
    id: string,
    props: ProcedureProps,
    createdAt: Date,
    updatedAt: Date,
  ): Procedure {
    return new Procedure(id, props, createdAt, updatedAt);
  }

  public update(patch: {
    name?: string;
    description?: string;
    cptCode?: string | null;
    performerId?: string | null;
    outcome?: string | null;
    performedAt?: Date | string | null;
  }): void {
    if (patch.description !== undefined) {
      this.props.description = patch.description.trim();
    }
    if (patch.cptCode !== undefined) this.props.cptCode = patch.cptCode;
    if (patch.performerId !== undefined) {
      this.props.performerId = patch.performerId;
    }
    if (patch.outcome !== undefined) this.props.outcome = patch.outcome;
    if (patch.performedAt !== undefined) {
      this.props.performedAt = patch.performedAt
        ? new Date(patch.performedAt)
        : null;
    }
    if (patch.name !== undefined) {
      this.props.name = ProcedureName.create(patch.name);
    } else if (patch.cptCode || patch.description) {
      const label =
        this.props.cptCode?.trim() ||
        this.props.description.slice(0, 255) ||
        'Procedure';
      this.props.name = ProcedureName.create(label);
    }
    this.touch();
  }

  public getName(): ProcedureName {
    return this.props.name;
  }
  public getDescription(): string | undefined {
    return this.props.description;
  }
  public getConsultationId(): string {
    return this.props.consultationId;
  }
  public getPatientId(): string {
    return this.props.patientId;
  }
  public getCptCode(): string | null | undefined {
    return this.props.cptCode;
  }
  public getPerformerId(): string | null | undefined {
    return this.props.performerId;
  }
  public getOutcome(): string | null | undefined {
    return this.props.outcome;
  }
  public getPerformedAt(): Date | null | undefined {
    return this.props.performedAt;
  }
}
