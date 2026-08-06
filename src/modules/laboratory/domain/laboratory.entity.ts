/**
 * File: laboratory.entity.ts
 * Module: laboratory
 * Purpose: Domain entity for laboratory requests (thin scaffold over LaboratoryRequests).
 */

import { randomUUID } from 'crypto';
import { Entity } from '../../../core/domain';
import { LaboratoryName } from './value-objects/laboratory-name.vo';

export type LaboratoryProps = {
  name: LaboratoryName;
  description?: string;
  patientId?: string;
  requestedBy?: string;
};

export class Laboratory extends Entity<string> {
  private name: LaboratoryName;
  private description?: string;
  private patientId?: string;
  private requestedBy?: string;

  private constructor(
    id: string,
    props: LaboratoryProps,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this.name = props.name;
    this.description = props.description;
    this.patientId = props.patientId;
    this.requestedBy = props.requestedBy;
  }

  public static create(input: {
    name: string;
    description?: string;
    patientId?: string;
    requestedBy?: string;
  }): Laboratory {
    const now = new Date();
    return new Laboratory(
      randomUUID(),
      {
        name: LaboratoryName.create(input.name),
        description: input.description,
        patientId: input.patientId,
        requestedBy: input.requestedBy,
      },
      now,
      now,
    );
  }

  public static reconstitute(
    id: string,
    props: LaboratoryProps,
    createdAt: Date,
    updatedAt: Date,
  ): Laboratory {
    return new Laboratory(id, props, createdAt, updatedAt);
  }

  public getName(): LaboratoryName {
    return this.name;
  }

  public getDescription(): string | undefined {
    return this.description;
  }

  public getPatientId(): string | undefined {
    return this.patientId;
  }

  public getRequestedBy(): string | undefined {
    return this.requestedBy;
  }
}
