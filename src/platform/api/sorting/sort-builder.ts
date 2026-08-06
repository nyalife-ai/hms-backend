export type SortDirection = 'asc' | 'desc';

export interface SortField {
  readonly field: string;
  readonly direction: SortDirection;
}

export class SortBuilder {
  private readonly allowedFields: ReadonlySet<string>;

  public constructor(allowedFields: readonly string[]) {
    if (allowedFields.some((field) => !SortBuilder.isSafeField(field))) {
      throw new Error('Sort allowlist contains an invalid field');
    }
    this.allowedFields = new Set(allowedFields);
  }

  public parse(value: string): readonly SortField[] {
    if (value.trim() === '') return [];
    return value.split(',').map((part) => {
      const segments = part.trim().split(':');
      if (segments.length !== 2)
        throw new Error(`Invalid sort expression: ${part}`);
      const [field, direction] = segments;
      if (!field || !SortBuilder.isSafeField(field)) {
        throw new Error(`Invalid sort field: ${field}`);
      }
      if (!this.allowedFields.has(field)) {
        throw new Error(`Sort field is not allowed: ${field}`);
      }
      if (direction !== 'asc' && direction !== 'desc') {
        throw new Error(`Invalid sort direction: ${direction}`);
      }
      return { field, direction };
    });
  }

  private static isSafeField(field: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_.]*$/u.test(field);
  }
}
