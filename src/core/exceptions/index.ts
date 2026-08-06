/**
 * Application exception hierarchy — transport-agnostic.
 * HTTP/gRPC status mapping belongs in platform/api.
 */

export { BaseApplicationException } from './base-application.exception';
export type { ExceptionMetadata } from './base-application.exception';

export { DomainException } from './domain.exception';
export { ValidationException } from './validation.exception';
export { NotFoundException } from './not-found.exception';
export { ConflictException } from './conflict.exception';
export { BusinessRuleException } from './business-rule.exception';
