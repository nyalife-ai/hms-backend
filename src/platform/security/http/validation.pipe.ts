import { Injectable, type PipeTransform } from '@nestjs/common';
import { ValidationException } from '../../../core';

export interface SecurityValidator<T> {
  validate(value: T): readonly string[] | Promise<readonly string[]>;
}

@Injectable()
export class ValidationPipeline<T = unknown> implements PipeTransform<
  T,
  Promise<T>
> {
  public constructor(
    private readonly validators: readonly SecurityValidator<T>[] = [],
  ) {}

  public async transform(value: T): Promise<T> {
    const messages = (
      await Promise.all(
        this.validators.map((validator) =>
          Promise.resolve(validator.validate(value)),
        ),
      )
    ).flat();
    if (messages.length > 0) {
      throw new ValidationException(
        'Request validation failed',
        messages.map((message) => ({ field: 'request', message })),
      );
    }
    return value;
  }
}
