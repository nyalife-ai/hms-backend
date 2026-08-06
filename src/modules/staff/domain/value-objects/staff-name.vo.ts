/**
 * File: staff-name.vo.ts
 * Module: staff
 * Purpose: Value object for staff name invariants.
 */

import { ValueObject } from '../../../../core/domain';

export type StaffNameProps = { value: string };

export class StaffName extends ValueObject<StaffNameProps> {
  private constructor(props: StaffNameProps) {
    super(props);
  }

  public static create(raw: string): StaffName {
    const trimmed = raw?.trim() ?? '';
    if (trimmed.length < 1 || trimmed.length > 255) {
      throw new Error('Staff name must be 1-255 characters');
    }
    return new StaffName({ value: trimmed });
  }

  public getValue(): string {
    return this.props.value;
  }

  protected validate(props: Readonly<StaffNameProps>): void {
    if (!props.value?.trim()) throw new Error('Staff name is required');
  }

  protected getEqualityComponents(): readonly unknown[] {
    return [this.props.value];
  }
}
