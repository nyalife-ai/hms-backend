/**
 * File: audit-name.vo.ts
 * Module: audit
 * Purpose: Value object for audit name invariants.
 */

import { ValueObject } from '../../../../core/domain';

export type AuditNameProps = { value: string };

export class AuditName extends ValueObject<AuditNameProps> {
  private constructor(props: AuditNameProps) {
    super(props);
  }

  public static create(raw: string): AuditName {
    const trimmed = raw?.trim() ?? '';
    if (trimmed.length < 1 || trimmed.length > 255) {
      throw new Error('Audit name must be 1-255 characters');
    }
    return new AuditName({ value: trimmed });
  }

  public getValue(): string {
    return this.props.value;
  }

  protected validate(props: Readonly<AuditNameProps>): void {
    if (!props.value?.trim()) throw new Error('Audit name is required');
  }

  protected getEqualityComponents(): readonly unknown[] {
    return [this.props.value];
  }
}
