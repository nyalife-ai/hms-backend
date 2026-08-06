import { generateId } from '../identity/generate-id';

/**
 * Integration events cross process / service boundaries.
 * Payload should be stable and versioned for consumers outside this service.
 */

export type IntegrationEventProps = {
  readonly eventId: string;
  readonly occurredAt: Date;
  readonly eventVersion: number;
  readonly eventName: string;
  readonly source: string;
  readonly correlationId?: string;
  readonly payload: Readonly<Record<string, unknown>>;
};

export function createIntegrationEventId(): string {
  return generateId('int');
}

export abstract class IntegrationEvent implements IntegrationEventProps {
  public readonly eventId: string;
  public readonly eventVersion: number;
  public readonly eventName: string;
  public readonly source: string;
  public readonly correlationId?: string;
  public readonly payload: Readonly<Record<string, unknown>>;
  private readonly _occurredAt: Date;

  protected constructor(props: IntegrationEventProps) {
    this.eventId = props.eventId;
    this._occurredAt = new Date(props.occurredAt.getTime());
    this.eventVersion = props.eventVersion;
    this.eventName = props.eventName;
    this.source = props.source;
    this.correlationId = props.correlationId;
    this.payload = Object.freeze({ ...props.payload });
  }

  public get occurredAt(): Date {
    return new Date(this._occurredAt.getTime());
  }
}
