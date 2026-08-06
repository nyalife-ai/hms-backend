import {
  BaseApplicationException,
  type ExceptionMetadata,
} from './base-application.exception';

/**
 * Raised when a domain invariant or aggregate rule is violated.
 */
export class DomainException extends BaseApplicationException {
  public constructor(
    message: string,
    code = 'DOMAIN_ERROR',
    metadata?: ExceptionMetadata,
    cause?: Error,
  ) {
    super({ message, code, metadata, cause });
  }
}
