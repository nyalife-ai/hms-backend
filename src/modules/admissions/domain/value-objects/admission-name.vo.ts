/**
 * File: admission-name.vo.ts
 * Module: admissions
 * Purpose: Value object for admission name invariants.
 */

import { ValueObject } from '../../../../core/domain';

export type AdmissionNameProps = { value: string };

export class AdmissionName extends ValueObject<AdmissionNameProps> {
  private constructor(props: AdmissionNameProps) {
    super(props);
  }

  public static create(raw: string): AdmissionName {
    const trimmed = raw?.trim() ?? '';
    if (trimmed.length < 1 || trimmed.length > 255) {
      throw new Error('Admission name must be 1-255 characters');
    }
    return new AdmissionName({ value: trimmed });
  }

  public getValue(): string {
    return this.props.value;
  }

  protected validate(props: Readonly<AdmissionNameProps>): void {
    if (!props.value?.trim()) throw new Error('Admission name is required');
  }

  protected getEqualityComponents(): readonly unknown[] {
    return [this.props.value];
  }
}
