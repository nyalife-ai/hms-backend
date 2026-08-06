/**
 * File: medication-name.vo.ts
 * Module: medications
 * Purpose: Value object for medication name invariants.
 */

import { ValueObject } from '../../../../core/domain';

export type MedicationNameProps = { value: string };

export class MedicationName extends ValueObject<MedicationNameProps> {
  private constructor(props: MedicationNameProps) {
    super(props);
  }

  public static create(raw: string): MedicationName {
    const trimmed = raw?.trim() ?? '';
    if (trimmed.length < 1 || trimmed.length > 255) {
      throw new Error('Medication name must be 1-255 characters');
    }
    return new MedicationName({ value: trimmed });
  }

  public getValue(): string {
    return this.props.value;
  }

  protected validate(props: Readonly<MedicationNameProps>): void {
    if (!props.value?.trim()) throw new Error('Medication name is required');
  }

  protected getEqualityComponents(): readonly unknown[] {
    return [this.props.value];
  }
}
