/**
 * Medication domain — pharmacy.medications (db.sql).
 */

import { randomUUID } from 'crypto';
import { Entity } from '../../../core/domain';
import { MedicationName } from './value-objects/medication-name.vo';

export type MedicationProps = {
  name: MedicationName;
  genericName?: string | null;
  form?: string | null;
  strength?: string | null;
  unit?: string | null;
  standardSellingPrice: number;
  isActive: boolean;
  description?: string | null;
};

export class Medication extends Entity<string> {
  private props: MedicationProps;

  private constructor(
    id: string,
    props: MedicationProps,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this.props = props;
  }

  public static create(input: {
    name: string;
    description?: string;
    genericName?: string;
    form?: string;
    strength?: string;
    unit?: string;
    standardSellingPrice?: number;
  }): Medication {
    const now = new Date();
    return new Medication(
      randomUUID(),
      {
        name: MedicationName.create(input.name),
        genericName: input.genericName,
        form: input.form,
        strength: input.strength,
        unit: input.unit,
        standardSellingPrice: input.standardSellingPrice ?? 0,
        isActive: true,
        description: input.description,
      },
      now,
      now,
    );
  }

  public static reconstitute(
    id: string,
    props: MedicationProps,
    createdAt: Date,
    updatedAt: Date,
  ): Medication {
    return new Medication(id, props, createdAt, updatedAt);
  }

  public update(patch: Partial<Omit<MedicationProps, 'name'> & { name?: string }>): void {
    if (patch.name !== undefined) {
      this.props.name = MedicationName.create(patch.name);
    }
    const { name: _n, ...rest } = patch;
    this.props = { ...this.props, ...rest };
    this.touch();
  }

  public getName(): MedicationName {
    return this.props.name;
  }
  public getDescription(): string | undefined {
    return this.props.description ?? undefined;
  }
  public getGenericName(): string | null | undefined {
    return this.props.genericName;
  }
  public getForm(): string | null | undefined {
    return this.props.form;
  }
  public getStrength(): string | null | undefined {
    return this.props.strength;
  }
  public getUnit(): string | null | undefined {
    return this.props.unit;
  }
  public getStandardSellingPrice(): number {
    return this.props.standardSellingPrice;
  }
  public getIsActive(): boolean {
    return this.props.isActive;
  }
}
