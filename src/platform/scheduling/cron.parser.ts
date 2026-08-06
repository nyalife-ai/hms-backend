interface CronField {
  readonly values: ReadonlySet<number>;
}

interface FieldDefinition {
  readonly minimum: number;
  readonly maximum: number;
  readonly sundayAlias?: boolean;
}

const FIELD_DEFINITIONS: readonly FieldDefinition[] = [
  { minimum: 0, maximum: 59 },
  { minimum: 0, maximum: 23 },
  { minimum: 1, maximum: 31 },
  { minimum: 1, maximum: 12 },
  { minimum: 0, maximum: 7, sundayAlias: true },
];

export class CronParser {
  private readonly fields: readonly CronField[];

  public constructor(expression: string) {
    const parts = expression.trim().split(/\s+/u);
    if (parts.length !== FIELD_DEFINITIONS.length) {
      throw new SyntaxError('Cron expression must contain exactly five fields');
    }
    this.fields = parts.map((part, index) =>
      this.parseField(part, FIELD_DEFINITIONS[index]),
    );
  }

  public matches(date: Date): boolean {
    this.validateDate(date);
    const values = [
      date.getUTCMinutes(),
      date.getUTCHours(),
      date.getUTCDate(),
      date.getUTCMonth() + 1,
      date.getUTCDay(),
    ];
    return this.fields.every((field, index) => field.values.has(values[index]));
  }

  public nextRun(from: Date): Date {
    this.validateDate(from);
    const candidate = new Date(from);
    candidate.setUTCSeconds(0, 0);
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
    const limit = 8 * 366 * 24 * 60;
    for (let checked = 0; checked < limit; checked += 1) {
      if (this.matches(candidate)) {
        return new Date(candidate);
      }
      candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
    }
    throw new RangeError('Cron expression has no run within eight years');
  }

  private parseField(source: string, definition: FieldDefinition): CronField {
    const values = new Set<number>();
    for (const item of source.split(',')) {
      this.addItem(values, item, definition);
    }
    return { values };
  }

  private addItem(
    values: Set<number>,
    item: string,
    definition: FieldDefinition,
  ): void {
    if (item === '*') {
      this.addRange(
        values,
        definition.minimum,
        definition.maximum,
        1,
        definition,
      );
      return;
    }
    const stepMatch = /^\*\/(\d+)$/u.exec(item);
    if (stepMatch) {
      const step = Number(stepMatch[1]);
      if (step < 1) {
        throw new RangeError('Cron step must be positive');
      }
      this.addRange(
        values,
        definition.minimum,
        definition.maximum,
        step,
        definition,
      );
      return;
    }
    const rangeMatch = /^(\d+)-(\d+)$/u.exec(item);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      this.validateValue(start, definition);
      this.validateValue(end, definition);
      if (start > end) {
        throw new RangeError('Cron range start cannot exceed its end');
      }
      this.addRange(values, start, end, 1, definition);
      return;
    }
    if (!/^\d+$/u.test(item)) {
      throw new SyntaxError(`Invalid cron field item: ${item}`);
    }
    const value = Number(item);
    this.validateValue(value, definition);
    values.add(this.normalize(value, definition));
  }

  private addRange(
    values: Set<number>,
    start: number,
    end: number,
    step: number,
    definition: FieldDefinition,
  ): void {
    for (let value = start; value <= end; value += step) {
      values.add(this.normalize(value, definition));
    }
  }

  private validateValue(value: number, definition: FieldDefinition): void {
    if (value < definition.minimum || value > definition.maximum) {
      throw new RangeError(
        `Cron value must be between ${definition.minimum} and ${definition.maximum}`,
      );
    }
  }

  private normalize(value: number, definition: FieldDefinition): number {
    return definition.sundayAlias && value === 7 ? 0 : value;
  }

  private validateDate(date: Date): void {
    if (Number.isNaN(date.getTime())) {
      throw new RangeError('Date must be valid');
    }
  }
}
