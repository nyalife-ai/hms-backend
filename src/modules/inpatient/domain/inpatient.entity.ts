/**
 * File: inpatient.entity.ts
 * Module: inpatient
 * Purpose: Domain entity extending core Entity<string>.
 */

import { Entity } from '../../../core/domain';
import { generateId } from '../../../core/identity';
import { InpatientName } from './value-objects/inpatient-name.vo';

export type InpatientProps = {
  name: InpatientName;
  description?: string;
};

export class Inpatient extends Entity<string> {
  private name: InpatientName;
  private description?: string;

  private constructor(
    id: string,
    props: InpatientProps,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this.name = props.name;
    this.description = props.description;
  }

  public static create(input: { name: string; description?: string }): Inpatient {
    const now = new Date();
    return new Inpatient(
      generateId('inpatient'),
      {
        name: InpatientName.create(input.name),
        description: input.description,
      },
      now,
      now,
    );
  }

  public static reconstitute(
    id: string,
    props: InpatientProps,
    createdAt: Date,
    updatedAt: Date,
  ): Inpatient {
    return new Inpatient(id, props, createdAt, updatedAt);
  }

  public getName(): InpatientName {
    return this.name;
  }

  public getDescription(): string | undefined {
    return this.description;
  }
}
