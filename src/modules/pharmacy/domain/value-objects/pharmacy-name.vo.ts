/**
 * File: pharmacy-name.vo.ts
 * Module: pharmacy
 * Purpose: Value object for pharmacy name invariants.
 */

import { ValueObject } from '../../../../core/domain';

export type PharmacyNameProps = { value: string };

export class PharmacyName extends ValueObject<PharmacyNameProps> {
  private constructor(props: PharmacyNameProps) {
    super(props);
  }

  public static create(raw: string): PharmacyName {
    const trimmed = raw?.trim() ?? '';
    if (trimmed.length < 1 || trimmed.length > 255) {
      throw new Error('Pharmacy name must be 1-255 characters');
    }
    return new PharmacyName({ value: trimmed });
  }

  public getValue(): string {
    return this.props.value;
  }

  protected validate(props: Readonly<PharmacyNameProps>): void {
    if (!props.value?.trim()) throw new Error('Pharmacy name is required');
  }

  protected getEqualityComponents(): readonly unknown[] {
    return [this.props.value];
  }
}
