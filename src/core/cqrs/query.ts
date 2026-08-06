import { generateId } from '../identity/generate-id';

/**
 * Base query contract — intent to read application state without mutation.
 */

export type QueryProps = {
  readonly queryId: string;
  readonly occurredAt: Date;
  readonly correlationId?: string;
  readonly metadata?: Readonly<
    Record<string, Readonly<string | number | boolean | null>>
  >;
};

export interface Query extends QueryProps {
  readonly queryName: string;
}

export function createQueryId(): string {
  return generateId('qry');
}

export abstract class BaseQuery implements Query {
  public readonly queryId: string;
  public readonly correlationId?: string;
  public readonly metadata?: Readonly<
    Record<string, Readonly<string | number | boolean | null>>
  >;
  public abstract readonly queryName: string;
  private readonly _occurredAt: Date;

  protected constructor(props: Partial<QueryProps> = {}) {
    this.queryId = props.queryId ?? createQueryId();
    this._occurredAt = new Date((props.occurredAt ?? new Date()).getTime());
    this.correlationId = props.correlationId;
    this.metadata = props.metadata
      ? Object.freeze({ ...props.metadata })
      : undefined;
  }

  public get occurredAt(): Date {
    return new Date(this._occurredAt.getTime());
  }
}
