/**
 * File: insurance-policy-name.vo.ts
 * Module: insurance-policies
 * Purpose: Value object for insurance-policy name invariants.
 */

import { ValueObject } from '../../../../core/domain';

export type InsurancePolicyNameProps = { value: string };

export class InsurancePolicyName extends ValueObject<InsurancePolicyNameProps> {
  private constructor(props: InsurancePolicyNameProps) {
    super(props);
  }

  public static create(raw: string): InsurancePolicyName {
    const trimmed = raw?.trim() ?? '';
    if (trimmed.length < 1 || trimmed.length > 255) {
      throw new Error('InsurancePolicy name must be 1-255 characters');
    }
    return new InsurancePolicyName({ value: trimmed });
  }

  public getValue(): string {
    return this.props.value;
  }

  protected validate(props: Readonly<InsurancePolicyNameProps>): void {
    if (!props.value?.trim()) throw new Error('InsurancePolicy name is required');
  }

  protected getEqualityComponents(): readonly unknown[] {
    return [this.props.value];
  }
}
