/**
 * Event contracts — domain, application, and integration event shapes.
 * Transport (Kafka, RabbitMQ, SNS) is a platform concern.
 */

export { DomainEvent, createDomainEventId } from '../domain/domain-event';
export type { DomainEventProps } from '../domain/domain-event';

export {
  IntegrationEvent,
  createIntegrationEventId,
} from './integration-event';
export type { IntegrationEventProps } from './integration-event';

export {
  ApplicationEvent,
  createApplicationEventId,
} from './application-event';
export type { ApplicationEventProps } from './application-event';

export type { EventHandler } from './event-handler';
export type { CoreEvent } from './core-event';
