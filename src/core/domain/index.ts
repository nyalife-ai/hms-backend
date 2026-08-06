/**
 * Core domain — framework-independent DDD building blocks.
 *
 * No NestJS, ORM, or infrastructure imports are permitted in this package.
 */

export { Entity } from './entity';
export { AggregateRoot } from './aggregate-root';
export { ValueObject } from './value-object';
export { DomainEvent, createDomainEventId } from './domain-event';
export type { DomainEventProps } from './domain-event';
