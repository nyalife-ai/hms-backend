import {
  BaseApplicationException,
  type ExceptionMetadata,
} from './base-application.exception';

/**
 * Raised when input fails structural / semantic validation.
 */
export class ValidationException extends BaseApplicationException {
  public readonly fieldErrors: ReadonlyArray<{
    readonly field: string;
    readonly message: string;
  }>;

  public constructor(
    message: string,
    fieldErrors: ReadonlyArray<{ field: string; message: string }> = [],
    code = 'VALIDATION_ERROR',
    metadata?: ExceptionMetadata,
    cause?: Error,
  ) {
    super({
      message,
      code,
      metadata: {
        ...metadata,
        fieldErrorCount: fieldErrors.length,
      },
      cause,
    });
    this.fieldErrors = Object.freeze(
      fieldErrors.map((error) => Object.freeze({ ...error })),
    );
  }

  public override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      fieldErrors: this.fieldErrors,
    };
  }
}
