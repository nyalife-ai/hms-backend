export type FilterOperator = 'equals' | 'contains' | 'gte' | 'lte' | 'date';

export interface FilterInput {
  readonly field: string;
  readonly op: string;
  readonly value: unknown;
}

export interface FilterCriteria {
  readonly field: string;
  readonly operator: FilterOperator;
  readonly value: string | number | boolean | Date;
}

export class FilterParser {
  private static readonly operators: readonly FilterOperator[] = [
    'equals',
    'contains',
    'gte',
    'lte',
    'date',
  ];
  private readonly allowedFields: ReadonlySet<string>;

  public constructor(allowedFields: readonly string[]) {
    if (allowedFields.some((field) => !FilterParser.isSafeField(field))) {
      throw new Error('Filter allowlist contains an invalid field');
    }
    this.allowedFields = new Set(allowedFields);
  }

  public parse(inputs: readonly FilterInput[]): readonly FilterCriteria[] {
    return inputs.map((input) => this.parseOne(input));
  }

  private parseOne(input: FilterInput): FilterCriteria {
    if (!FilterParser.isSafeField(input.field)) {
      throw new Error(`Invalid filter field: ${input.field}`);
    }
    if (!this.allowedFields.has(input.field)) {
      throw new Error(`Filter field is not allowed: ${input.field}`);
    }
    if (!FilterParser.operators.includes(input.op as FilterOperator)) {
      throw new Error(`Unsupported filter operator: ${input.op}`);
    }
    const operator = input.op as FilterOperator;
    if (operator === 'contains' && typeof input.value !== 'string') {
      throw new Error('Contains filter requires a string');
    }
    if (
      (operator === 'gte' || operator === 'lte') &&
      typeof input.value !== 'number' &&
      typeof input.value !== 'string'
    ) {
      throw new Error('Range filter requires a number or string');
    }
    if (operator === 'date') {
      const date = new Date(String(input.value));
      if (Number.isNaN(date.getTime())) throw new Error('Invalid date filter');
      return { field: input.field, operator, value: date };
    }
    if (
      typeof input.value !== 'string' &&
      typeof input.value !== 'number' &&
      typeof input.value !== 'boolean'
    ) {
      throw new Error('Filter value must be scalar');
    }
    return { field: input.field, operator, value: input.value };
  }

  private static isSafeField(field: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_.]*$/u.test(field);
  }
}
