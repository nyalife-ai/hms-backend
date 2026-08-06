/**
 * File: appointment-name.vo.ts
 * Module: appointments
 * Purpose: Value object for appointment name invariants.
 */

import { ValueObject } from '../../../../core/domain';

export type AppointmentNameProps = { value: string };

export class AppointmentName extends ValueObject<AppointmentNameProps> {
  private constructor(props: AppointmentNameProps) {
    super(props);
  }

  public static create(raw: string): AppointmentName {
    const trimmed = raw?.trim() ?? '';
    if (trimmed.length < 1 || trimmed.length > 255) {
      throw new Error('Appointment name must be 1-255 characters');
    }
    return new AppointmentName({ value: trimmed });
  }

  public getValue(): string {
    return this.props.value;
  }

  protected validate(props: Readonly<AppointmentNameProps>): void {
    if (!props.value?.trim()) throw new Error('Appointment name is required');
  }

  protected getEqualityComponents(): readonly unknown[] {
    return [this.props.value];
  }
}
