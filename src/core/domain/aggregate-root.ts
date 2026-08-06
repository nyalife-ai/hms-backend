import { Entity } from './entity';
import { DomainEvent } from './domain-event';

/**
 * Aggregate root — consistency boundary that owns and exposes domain events.
 *
 * Application services / unit-of-work implementations pull events after a
 * successful persistence transaction and publish them via an event bus.
 *
 * @typeParam TId - Aggregate identity type.
 */
export abstract class AggregateRoot<TId> extends Entity<TId> {
  /**
   * Records a domain event against this aggregate.
   * Prefer calling from within command methods that mutate state.
   */
  protected record(event: DomainEvent): void {
    this.addDomainEvent(event);
  }

  /**
   * Alias retained for readability in domain method implementations.
   */
  protected addEvent(event: DomainEvent): void {
    this.record(event);
  }

  /**
   * Returns recorded events and clears the internal buffer atomically.
   * Intended for infrastructure outbox / event bus publishers.
   */
  public pullDomainEvents(): ReadonlyArray<DomainEvent> {
    const events = this.getDomainEvents();
    this.clearDomainEvents();
    return events;
  }

  /**
   * Clears events without returning them.
   */
  public clearEvents(): void {
    this.clearDomainEvents();
  }
}
