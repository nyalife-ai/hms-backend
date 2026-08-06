/**
 * File: bed-name.vo.ts
 * Module: beds
 * Purpose: Value object for bed name invariants.
 */

import { ValueObject } from '../../../../core/domain';

export type BedNameProps = { value: string };

export class BedName extends ValueObject<BedNameProps> {
  private constructor(props: BedNameProps) {
    super(props);
  }

  public static create(raw: string): BedName {
    const trimmed = raw?.trim() ?? '';
    if (trimmed.length < 1 || trimmed.length > 255) {
      throw new Error('Bed name must be 1-255 characters');
    }
    return new BedName({ value: trimmed });
  }

  public getValue(): string {
    return this.props.value;
  }

  protected validate(props: Readonly<BedNameProps>): void {
    if (!props.value?.trim()) throw new Error('Bed name is required');
  }

  protected getEqualityComponents(): readonly unknown[] {
    return [this.props.value];
  }
}
