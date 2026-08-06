/**
 * File: inpatient-name.vo.ts
 * Module: inpatient
 * Purpose: Value object for inpatient name invariants.
 */

import { ValueObject } from '../../../../core/domain';

export type InpatientNameProps = { value: string };

export class InpatientName extends ValueObject<InpatientNameProps> {
  private constructor(props: InpatientNameProps) {
    super(props);
  }

  public static create(raw: string): InpatientName {
    const trimmed = raw?.trim() ?? '';
    if (trimmed.length < 1 || trimmed.length > 255) {
      throw new Error('Inpatient name must be 1-255 characters');
    }
    return new InpatientName({ value: trimmed });
  }

  public getValue(): string {
    return this.props.value;
  }

  protected validate(props: Readonly<InpatientNameProps>): void {
    if (!props.value?.trim()) throw new Error('Inpatient name is required');
  }

  protected getEqualityComponents(): readonly unknown[] {
    return [this.props.value];
  }
}
