/**
 * File: admission.entity.ts
 * Module: admissions
 * Purpose: Domain entity extending core Entity<string>.
 */

import { Entity } from '../../../core/domain';
import { generateId } from '../../../core/identity';
import { AdmissionName } from './value-objects/admission-name.vo';

export type AdmissionProps = {
  name: AdmissionName;
  description?: string;
};

export class Admission extends Entity<string> {
  private name: AdmissionName;
  private description?: string;

  private constructor(
    id: string,
    props: AdmissionProps,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this.name = props.name;
    this.description = props.description;
  }

  public static create(input: { name: string; description?: string }): Admission {
    const now = new Date();
    return new Admission(
      generateId('admission'),
      {
        name: AdmissionName.create(input.name),
        description: input.description,
      },
      now,
      now,
    );
  }

  public static reconstitute(
    id: string,
    props: AdmissionProps,
    createdAt: Date,
    updatedAt: Date,
  ): Admission {
    return new Admission(id, props, createdAt, updatedAt);
  }

  public getName(): AdmissionName {
    return this.name;
  }

  public getDescription(): string | undefined {
    return this.description;
  }
}
