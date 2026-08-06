/**
 * File: diagnos-name.vo.ts
 * Module: diagnoses
 * Purpose: Value object for diagnos name invariants.
 */

import { ValueObject } from '../../../../core/domain';

export type DiagnosNameProps = { value: string };

export class DiagnosName extends ValueObject<DiagnosNameProps> {
  private constructor(props: DiagnosNameProps) {
    super(props);
  }

  public static create(raw: string): DiagnosName {
    const trimmed = raw?.trim() ?? '';
    if (trimmed.length < 1 || trimmed.length > 255) {
      throw new Error('Diagnos name must be 1-255 characters');
    }
    return new DiagnosName({ value: trimmed });
  }

  public getValue(): string {
    return this.props.value;
  }

  protected validate(props: Readonly<DiagnosNameProps>): void {
    if (!props.value?.trim()) throw new Error('Diagnos name is required');
  }

  protected getEqualityComponents(): readonly unknown[] {
    return [this.props.value];
  }
}
