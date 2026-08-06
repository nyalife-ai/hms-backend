/**
 * File: patient-name.vo.ts
 * Module: patients
 * Purpose: Value object for patient name invariants.
 */

import { ValueObject } from '../../../../core/domain';

export type PatientNameProps = { value: string };

export class PatientName extends ValueObject<PatientNameProps> {
  private constructor(props: PatientNameProps) {
    super(props);
  }

  public static create(raw: string): PatientName {
    const trimmed = raw?.trim() ?? '';
    if (trimmed.length < 1 || trimmed.length > 255) {
      throw new Error('Patient name must be 1-255 characters');
    }
    return new PatientName({ value: trimmed });
  }

  public getValue(): string {
    return this.props.value;
  }

  protected validate(props: Readonly<PatientNameProps>): void {
    if (!props.value?.trim()) throw new Error('Patient name is required');
  }

  protected getEqualityComponents(): readonly unknown[] {
    return [this.props.value];
  }
}
