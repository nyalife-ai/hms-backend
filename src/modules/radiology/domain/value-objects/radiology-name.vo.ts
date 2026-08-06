/**
 * File: radiology-name.vo.ts
 * Module: radiology
 * Purpose: Value object for radiology name invariants.
 */

import { ValueObject } from '../../../../core/domain';

export type RadiologyNameProps = { value: string };

export class RadiologyName extends ValueObject<RadiologyNameProps> {
  private constructor(props: RadiologyNameProps) {
    super(props);
  }

  public static create(raw: string): RadiologyName {
    const trimmed = raw?.trim() ?? '';
    if (trimmed.length < 1 || trimmed.length > 255) {
      throw new Error('Radiology name must be 1-255 characters');
    }
    return new RadiologyName({ value: trimmed });
  }

  public getValue(): string {
    return this.props.value;
  }

  protected validate(props: Readonly<RadiologyNameProps>): void {
    if (!props.value?.trim()) throw new Error('Radiology name is required');
  }

  protected getEqualityComponents(): readonly unknown[] {
    return [this.props.value];
  }
}
