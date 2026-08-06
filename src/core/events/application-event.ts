import { generateId } from '../identity/generate-id';

/**
 * Application events stay inside a single process / bounded context.
 * Useful for decoupling application services without leaving the process.
 */

export type ApplicationEventProps = {
  readonly eventId: string;
  readonly occurredAt: Date;
  readonly eventName: string;
  readonly correlationId?: string;
  readonly data?: Readonly<Record<string, unknown>>;
};

export function createApplicationEventId(): string {
  return generateId('app');
}

export abstract class ApplicationEvent implements ApplicationEventProps {
  public readonly eventId: string;
  public readonly eventName: string;
  public readonly correlationId?: string;
  public readonly data?: Readonly<Record<string, unknown>>;
  private readonly _occurredAt: Date;

  protected constructor(props: ApplicationEventProps) {
    this.eventId = props.eventId;
    this._occurredAt = new Date(props.occurredAt.getTime());
    this.eventName = props.eventName;
    this.correlationId = props.correlationId;
    this.data = props.data ? Object.freeze({ ...props.data }) : undefined;
  }

  public get occurredAt(): Date {
    return new Date(this._occurredAt.getTime());
  }
}
