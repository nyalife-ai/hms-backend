import { generateId } from '../identity/generate-id';

/**
 * Base domain event contract.
 *
 * Carries enough metadata for outbox publishing, event sourcing, and
 * cross-bounded-context integration without depending on a message broker.
 */

export type DomainEventProps = {
  readonly eventId: string;
  readonly aggregateId: string;
  readonly occurredAt: Date;
  readonly eventVersion: number;
  readonly eventName: string;
  readonly metadata?: Readonly<
    Record<string, Readonly<string | number | boolean | null>>
  >;
};

export function createDomainEventId(): string {
  return generateId('evt');
}

export abstract class DomainEvent implements DomainEventProps {
  public readonly eventId: string;
  public readonly aggregateId: string;
  public readonly eventVersion: number;
  public readonly eventName: string;
  public readonly metadata?: Readonly<
    Record<string, Readonly<string | number | boolean | null>>
  >;
  private readonly _occurredAt: Date;

  protected constructor(props: DomainEventProps) {
    this.eventId = props.eventId;
    this.aggregateId = props.aggregateId;
    this._occurredAt = new Date(props.occurredAt.getTime());
    this.eventVersion = props.eventVersion;
    this.eventName = props.eventName;
    this.metadata = props.metadata
      ? Object.freeze({ ...props.metadata })
      : undefined;
  }

  public get occurredAt(): Date {
    return new Date(this._occurredAt.getTime());
  }
}
