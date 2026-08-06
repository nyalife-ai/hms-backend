import {
  BaseApplicationException,
  type ExceptionMetadata,
} from './base-application.exception';

/**
 * Raised when a write conflicts with current state (duplicates, optimistic lock).
 */
export class ConflictException extends BaseApplicationException {
  public constructor(
    message: string,
    code = 'CONFLICT',
    metadata?: ExceptionMetadata,
    cause?: Error,
  ) {
    super({ message, code, metadata, cause });
  }
}
