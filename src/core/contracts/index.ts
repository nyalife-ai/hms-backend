/**
 * Core contracts — ORM-agnostic ports for persistence, time, identity, and rules.
 */

export type { Repository } from './repository.interface';
export type { ReadableRepository } from './repository.interface';
export type { WritableRepository } from './repository.interface';

export type { UnitOfWork } from './unit-of-work.interface';

export type { Clock } from './clock.interface';

export type { IdentifierGenerator } from './identifier-generator.interface';

export {
  Specification,
  AndSpecification,
  OrSpecification,
  NotSpecification,
} from './specification';

export { Result } from './result';
export type { ResultFailure } from './result';
