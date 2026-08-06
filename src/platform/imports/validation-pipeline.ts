import type {
  ImportRow,
  RowValidationResult,
  RowValidator,
} from './import.types';

export interface ValidationPipelineResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/** Runs an ordered list of {@link RowValidator}s against a row, collecting all errors. */
export class ValidationPipeline {
  public constructor(private readonly validators: readonly RowValidator[]) {}

  public async validate(row: ImportRow): Promise<ValidationPipelineResult> {
    const errors: string[] = [];
    for (const validator of this.validators) {
      const result = await validator.validate(row);
      if (!result.valid) {
        errors.push(
          ...(result.errors ?? [`Row ${row.index} failed validation`]),
        );
      }
    }
    return { valid: errors.length === 0, errors };
  }
}

/** Validator factory: fails a row when any of `fields` is missing or blank. */
export function requiredFieldsValidator(
  fields: readonly string[],
): RowValidator {
  return {
    validate(row: ImportRow): RowValidationResult {
      const missing = fields.filter((field) => {
        const value = row.values[field];
        return value === undefined || value.trim().length === 0;
      });
      return missing.length === 0
        ? { valid: true }
        : {
            valid: false,
            errors: missing.map((field) => `Missing required field "${field}"`),
          };
    },
  };
}
