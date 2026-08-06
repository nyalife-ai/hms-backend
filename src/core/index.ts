/**
 * @packageDocumentation
 * Framework-independent core of the API scaffold.
 *
 * This package MUST NOT import NestJS, Prisma, TypeORM, Redis, Kafka, or AWS.
 */

export * from './domain';
export * from './cqrs';
export {
  IntegrationEvent,
  createIntegrationEventId,
  ApplicationEvent,
  createApplicationEventId,
} from './events';
export type {
  IntegrationEventProps,
  ApplicationEventProps,
  EventHandler,
  CoreEvent,
} from './events';
export * from './exceptions';
export * from './contracts';
export * from './identity';
