import type { DomainEvent } from '../domain/domain-event';
import type { IntegrationEvent } from './integration-event';
import type { ApplicationEvent } from './application-event';

/**
 * Discriminated union of all core event kinds.
 */
export type CoreEvent = DomainEvent | IntegrationEvent | ApplicationEvent;
