import { Injectable } from '@nestjs/common';
import { ValidationException } from '../../core';
import { ConfigSchema } from './config.schema';

@Injectable()
export class ConfigValidator {
  public validate<T extends Readonly<Record<string, unknown>>>(
    raw: Readonly<Record<string, unknown>>,
    schema: ConfigSchema<T>,
  ): Readonly<T> {
    const result = schema.validate(raw);
    if (result.errors) {
      throw new ValidationException(
        'Configuration validation failed',
        result.errors,
      );
    }
    return result.value;
  }
}
