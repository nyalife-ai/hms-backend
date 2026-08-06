/**
 * File: vital-sign-name.vo.ts
 * Module: vital-signs
 * Purpose: Value object for vital-sign name invariants.
 */

import { ValueObject } from '../../../../core/domain';

export type VitalSignNameProps = { value: string };

export class VitalSignName extends ValueObject<VitalSignNameProps> {
  private constructor(props: VitalSignNameProps) {
    super(props);
  }

  public static create(raw: string): VitalSignName {
    const trimmed = raw?.trim() ?? '';
    if (trimmed.length < 1 || trimmed.length > 255) {
      throw new Error('VitalSign name must be 1-255 characters');
    }
    return new VitalSignName({ value: trimmed });
  }

  public getValue(): string {
    return this.props.value;
  }

  protected validate(props: Readonly<VitalSignNameProps>): void {
    if (!props.value?.trim()) throw new Error('VitalSign name is required');
  }

  protected getEqualityComponents(): readonly unknown[] {
    return [this.props.value];
  }
}
