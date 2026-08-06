/**
 * File: consultation-name.vo.ts
 * Module: consultations
 * Purpose: Value object for consultation name invariants.
 */

import { ValueObject } from '../../../../core/domain';

export type ConsultationNameProps = { value: string };

export class ConsultationName extends ValueObject<ConsultationNameProps> {
  private constructor(props: ConsultationNameProps) {
    super(props);
  }

  public static create(raw: string): ConsultationName {
    const trimmed = raw?.trim() ?? '';
    if (trimmed.length < 1 || trimmed.length > 255) {
      throw new Error('Consultation name must be 1-255 characters');
    }
    return new ConsultationName({ value: trimmed });
  }

  public getValue(): string {
    return this.props.value;
  }

  protected validate(props: Readonly<ConsultationNameProps>): void {
    if (!props.value?.trim()) throw new Error('Consultation name is required');
  }

  protected getEqualityComponents(): readonly unknown[] {
    return [this.props.value];
  }
}
