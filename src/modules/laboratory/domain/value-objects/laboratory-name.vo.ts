/**
 * File: laboratory-name.vo.ts
 * Module: laboratory
 * Purpose: Value object for laboratory name invariants.
 */

import { ValueObject } from '../../../../core/domain';

export type LaboratoryNameProps = { value: string };

export class LaboratoryName extends ValueObject<LaboratoryNameProps> {
  private constructor(props: LaboratoryNameProps) {
    super(props);
  }

  public static create(raw: string): LaboratoryName {
    const trimmed = raw?.trim() ?? '';
    if (trimmed.length < 1 || trimmed.length > 255) {
      throw new Error('Laboratory name must be 1-255 characters');
    }
    return new LaboratoryName({ value: trimmed });
  }

  public getValue(): string {
    return this.props.value;
  }

  protected validate(props: Readonly<LaboratoryNameProps>): void {
    if (!props.value?.trim()) throw new Error('Laboratory name is required');
  }

  protected getEqualityComponents(): readonly unknown[] {
    return [this.props.value];
  }
}
