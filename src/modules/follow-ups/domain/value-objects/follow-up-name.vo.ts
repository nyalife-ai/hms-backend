/**
 * File: follow-up-name.vo.ts
 * Module: follow-ups
 * Purpose: Value object for follow-up name invariants.
 */

import { ValueObject } from '../../../../core/domain';

export type FollowUpNameProps = { value: string };

export class FollowUpName extends ValueObject<FollowUpNameProps> {
  private constructor(props: FollowUpNameProps) {
    super(props);
  }

  public static create(raw: string): FollowUpName {
    const trimmed = raw?.trim() ?? '';
    if (trimmed.length < 1 || trimmed.length > 255) {
      throw new Error('FollowUp name must be 1-255 characters');
    }
    return new FollowUpName({ value: trimmed });
  }

  public getValue(): string {
    return this.props.value;
  }

  protected validate(props: Readonly<FollowUpNameProps>): void {
    if (!props.value?.trim()) throw new Error('FollowUp name is required');
  }

  protected getEqualityComponents(): readonly unknown[] {
    return [this.props.value];
  }
}
