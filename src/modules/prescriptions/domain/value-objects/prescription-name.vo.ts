/**
 * File: prescription-name.vo.ts
 * Module: prescriptions
 * Purpose: Value object for prescription name invariants.
 */

import { ValueObject } from '../../../../core/domain';

export type PrescriptionNameProps = { value: string };

export class PrescriptionName extends ValueObject<PrescriptionNameProps> {
  private constructor(props: PrescriptionNameProps) {
    super(props);
  }

  public static create(raw: string): PrescriptionName {
    const trimmed = raw?.trim() ?? '';
    if (trimmed.length < 1 || trimmed.length > 255) {
      throw new Error('Prescription name must be 1-255 characters');
    }
    return new PrescriptionName({ value: trimmed });
  }

  public getValue(): string {
    return this.props.value;
  }

  protected validate(props: Readonly<PrescriptionNameProps>): void {
    if (!props.value?.trim()) throw new Error('Prescription name is required');
  }

  protected getEqualityComponents(): readonly unknown[] {
    return [this.props.value];
  }
}
