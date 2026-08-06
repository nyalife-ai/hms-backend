export type ConfigFieldType =
  'string' | 'number' | 'boolean' | 'object' | 'array';

export interface ConfigField<TValue = unknown> {
  readonly type: ConfigFieldType;
  readonly required?: boolean;
  readonly default?: TValue;
  readonly enum?: readonly TValue[];
  readonly min?: number;
  readonly max?: number;
  readonly custom?: (
    value: TValue,
    raw: Readonly<Record<string, unknown>>,
  ) => boolean | string;
}

export type ConfigFields<T extends Readonly<Record<string, unknown>>> = {
  readonly [K in keyof T]: ConfigField<T[K]>;
};

export interface ConfigError {
  readonly field: string;
  readonly message: string;
}

export type ConfigValidationResult<T> =
  | { readonly value: Readonly<T>; readonly errors?: never }
  | { readonly value?: never; readonly errors: readonly ConfigError[] };

export class ConfigSchema<T extends Readonly<Record<string, unknown>>> {
  public constructor(public readonly fields: ConfigFields<T>) {}

  public validate(
    raw: Readonly<Record<string, unknown>>,
  ): ConfigValidationResult<T> {
    const output: Record<string, unknown> = {};
    const errors: ConfigError[] = [];

    for (const field of Object.keys(this.fields) as Array<keyof T & string>) {
      const definition = this.fields[field];
      const supplied = raw[field] !== undefined;
      const value = supplied ? raw[field] : definition.default;
      if (value === undefined) {
        if (definition.required) {
          errors.push({ field, message: 'is required' });
        }
        continue;
      }
      if (!this.matchesType(value, definition.type)) {
        errors.push({ field, message: `must be of type ${definition.type}` });
        continue;
      }
      if (
        definition.enum &&
        !definition.enum.includes(value as T[typeof field])
      ) {
        errors.push({ field, message: 'must be one of the allowed values' });
      }
      const size = typeof value === 'number' ? value : this.sizeOf(value);
      if (
        definition.min !== undefined &&
        size !== undefined &&
        size < definition.min
      ) {
        errors.push({ field, message: `must be at least ${definition.min}` });
      }
      if (
        definition.max !== undefined &&
        size !== undefined &&
        size > definition.max
      ) {
        errors.push({ field, message: `must be at most ${definition.max}` });
      }
      if (definition.custom) {
        const customResult = definition.custom(value as T[typeof field], raw);
        if (customResult !== true) {
          errors.push({
            field,
            message:
              typeof customResult === 'string'
                ? customResult
                : 'failed custom validation',
          });
        }
      }
      output[field] = value;
    }

    return errors.length > 0
      ? { errors: Object.freeze(errors) }
      : { value: Object.freeze(output) as Readonly<T> };
  }

  private matchesType(value: unknown, type: ConfigFieldType): boolean {
    if (type === 'array') {
      return Array.isArray(value);
    }
    if (type === 'object') {
      return (
        typeof value === 'object' && value !== null && !Array.isArray(value)
      );
    }
    return typeof value === type;
  }

  private sizeOf(value: unknown): number | undefined {
    if (typeof value === 'string' || Array.isArray(value)) {
      return value.length;
    }
    return undefined;
  }
}
