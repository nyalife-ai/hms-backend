/**
 * File: pharmacy.entity.ts
 * Module: pharmacy
 * Purpose: Domain entity extending core Entity<string>.
 */

import { Entity } from '../../../core/domain';
import { generateId } from '../../../core/identity';
import { PharmacyName } from './value-objects/pharmacy-name.vo';

export type PharmacyProps = {
  name: PharmacyName;
  description?: string;
};

export class Pharmacy extends Entity<string> {
  private name: PharmacyName;
  private description?: string;

  private constructor(
    id: string,
    props: PharmacyProps,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this.name = props.name;
    this.description = props.description;
  }

  public static create(input: { name: string; description?: string }): Pharmacy {
    const now = new Date();
    return new Pharmacy(
      generateId('pharmacy'),
      {
        name: PharmacyName.create(input.name),
        description: input.description,
      },
      now,
      now,
    );
  }

  public static reconstitute(
    id: string,
    props: PharmacyProps,
    createdAt: Date,
    updatedAt: Date,
  ): Pharmacy {
    return new Pharmacy(id, props, createdAt, updatedAt);
  }

  public getName(): PharmacyName {
    return this.name;
  }

  public getDescription(): string | undefined {
    return this.description;
  }
}
