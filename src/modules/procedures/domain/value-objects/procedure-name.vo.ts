/**
 * File: procedure-name.vo.ts
 * Module: procedures
 * Purpose: Value object for procedure name invariants.
 */

import { ValueObject } from '../../../../core/domain';

export type ProcedureNameProps = { value: string };

export class ProcedureName extends ValueObject<ProcedureNameProps> {
  private constructor(props: ProcedureNameProps) {
    super(props);
  }

  public static create(raw: string): ProcedureName {
    const trimmed = raw?.trim() ?? '';
    if (trimmed.length < 1 || trimmed.length > 255) {
      throw new Error('Procedure name must be 1-255 characters');
    }
    return new ProcedureName({ value: trimmed });
  }

  public getValue(): string {
    return this.props.value;
  }

  protected validate(props: Readonly<ProcedureNameProps>): void {
    if (!props.value?.trim()) throw new Error('Procedure name is required');
  }

  protected getEqualityComponents(): readonly unknown[] {
    return [this.props.value];
  }
}
