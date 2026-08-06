/**
 * File: document-name.vo.ts
 * Module: documents
 * Purpose: Value object for document name invariants.
 */

import { ValueObject } from '../../../../core/domain';

export type DocumentNameProps = { value: string };

export class DocumentName extends ValueObject<DocumentNameProps> {
  private constructor(props: DocumentNameProps) {
    super(props);
  }

  public static create(raw: string): DocumentName {
    const trimmed = raw?.trim() ?? '';
    if (trimmed.length < 1 || trimmed.length > 255) {
      throw new Error('Document name must be 1-255 characters');
    }
    return new DocumentName({ value: trimmed });
  }

  public getValue(): string {
    return this.props.value;
  }

  protected validate(props: Readonly<DocumentNameProps>): void {
    if (!props.value?.trim()) throw new Error('Document name is required');
  }

  protected getEqualityComponents(): readonly unknown[] {
    return [this.props.value];
  }
}
