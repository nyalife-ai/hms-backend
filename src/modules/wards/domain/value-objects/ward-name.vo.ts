/**
 * File: ward-name.vo.ts
 * Module: wards
 * Purpose: Value object for ward name invariants.
 */

import { ValueObject } from '../../../../core/domain';

export type WardNameProps = { value: string };

export class WardName extends ValueObject<WardNameProps> {
  private constructor(props: WardNameProps) {
    super(props);
  }

  public static create(raw: string): WardName {
    const trimmed = raw?.trim() ?? '';
    if (trimmed.length < 1 || trimmed.length > 255) {
      throw new Error('Ward name must be 1-255 characters');
    }
    return new WardName({ value: trimmed });
  }

  public getValue(): string {
    return this.props.value;
  }

  protected validate(props: Readonly<WardNameProps>): void {
    if (!props.value?.trim()) throw new Error('Ward name is required');
  }

  protected getEqualityComponents(): readonly unknown[] {
    return [this.props.value];
  }
}
