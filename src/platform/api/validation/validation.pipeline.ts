import { ValidationException } from '../../../core';
import { type ValidationError, type Validator } from './validator.interface';

export class ValidationPipeline<T> {
  public constructor(private readonly validators: readonly Validator<T>[]) {}

  public async run(input: T): Promise<T> {
    let value = input;
    const errors: ValidationError[] = [];
    for (const validator of this.validators) {
      if (validator.sanitize) value = await validator.sanitize(value);
      const result = await validator.validate(value);
      if (!result.valid) {
        errors.push(
          ...(result.errors ?? [{ field: '', message: 'Validation failed' }]),
        );
      }
    }
    if (errors.length > 0) {
      throw new ValidationException('Input validation failed', errors);
    }
    return value;
  }
}
