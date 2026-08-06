import { DomainEvent } from './domain-event';

const cloneDate = (value: Date): Date => new Date(value.getTime());

/**
 * Base entity with identity equality and a domain-event collection.
 *
 * @typeParam TId - Strongly typed identity (string, branded ID, value object, …).
 *
 * Subclasses must use a protected constructor and static factory methods
 * so invariants can be enforced at creation time.
 */
export abstract class Entity<TId> {
  private readonly domainEvents: DomainEvent[] = [];
  protected readonly id: TId;
  protected readonly createdAt: Date;
  protected updatedAt: Date;

  protected constructor(id: TId, createdAt: Date, updatedAt: Date) {
    if (id === null || id === undefined) {
      throw new Error('Entity identity is required');
    }
    this.id = id;
    this.createdAt = cloneDate(createdAt);
    this.updatedAt = cloneDate(updatedAt);
  }

  public getId(): TId {
    return this.id;
  }

  public getCreatedAt(): Date {
    return cloneDate(this.createdAt);
  }

  public getUpdatedAt(): Date {
    return cloneDate(this.updatedAt);
  }

  /**
   * Identity equality — two entities of the same class with equal IDs are equal.
   * Reference equality short-circuits; different constructors never match.
   */
  public equals(other: Entity<TId> | null | undefined): boolean {
    if (other === null || other === undefined) {
      return false;
    }
    if (this === other) {
      return true;
    }
    if (this.constructor !== other.constructor) {
      return false;
    }
    return this.idEquals(this.id, other.id);
  }

  protected touch(at: Date = new Date()): void {
    this.updatedAt = cloneDate(at);
  }

  protected addDomainEvent(event: DomainEvent): void {
    this.domainEvents.push(event);
  }

  /**
   * Returns a defensive copy of recorded domain events.
   */
  public getDomainEvents(): ReadonlyArray<DomainEvent> {
    return [...this.domainEvents];
  }

  /**
   * Clears recorded domain events after they have been dispatched.
   */
  public clearDomainEvents(): void {
    this.domainEvents.length = 0;
  }

  private idEquals(a: TId, b: TId): boolean {
    if (typeof a === 'object' && a !== null) {
      const equals = Reflect.get(a, 'equals');
      if (typeof equals === 'function') {
        return (
          (equals as (this: TId, other: TId) => unknown).call(a, b) === true
        );
      }
    }
    return Object.is(a, b);
  }
}
