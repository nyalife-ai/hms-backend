import {
  BaseApplicationException,
  type ExceptionMetadata,
} from './base-application.exception';

/**
 * Raised when a requested resource cannot be located.
 */
export class NotFoundException extends BaseApplicationException {
  public constructor(
    resource: string,
    identifier?: string | number,
    code = 'NOT_FOUND',
    metadata?: ExceptionMetadata,
    cause?: Error,
  ) {
    const message =
      identifier === undefined
        ? `${resource} was not found`
        : `${resource} with id '${String(identifier)}' was not found`;

    super({
      message,
      code,
      // Spread metadata first so reserved resource/identifier cannot be overwritten.
      metadata: {
        ...metadata,
        resource,
        identifier: identifier === undefined ? null : String(identifier),
      },
      cause,
    });
  }
}
