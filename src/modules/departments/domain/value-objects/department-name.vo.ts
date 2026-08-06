/**
 * File: department-name.vo.ts
 * Module: departments
 * Purpose: Value object for department name invariants.
 */

import { ValueObject } from '../../../../core/domain';

export type DepartmentNameProps = { value: string };

export class DepartmentName extends ValueObject<DepartmentNameProps> {
  private constructor(props: DepartmentNameProps) {
    super(props);
  }

  public static create(raw: string): DepartmentName {
    const trimmed = raw?.trim() ?? '';
    if (trimmed.length < 1 || trimmed.length > 255) {
      throw new Error('Department name must be 1-255 characters');
    }
    return new DepartmentName({ value: trimmed });
  }

  public getValue(): string {
    return this.props.value;
  }

  protected validate(props: Readonly<DepartmentNameProps>): void {
    if (!props.value?.trim()) throw new Error('Department name is required');
  }

  protected getEqualityComponents(): readonly unknown[] {
    return [this.props.value];
  }
}
