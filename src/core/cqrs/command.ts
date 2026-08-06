import { generateId } from '../identity/generate-id';

/**
 * Base command contract — intent to mutate application/domain state.
 */

export type CommandProps = {
  readonly commandId: string;
  readonly occurredAt: Date;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly metadata?: Readonly<
    Record<string, Readonly<string | number | boolean | null>>
  >;
};

export interface Command extends CommandProps {
  readonly commandName: string;
}

export function createCommandId(): string {
  return generateId('cmd');
}

export abstract class BaseCommand implements Command {
  public readonly commandId: string;
  public readonly correlationId?: string;
  public readonly causationId?: string;
  public readonly metadata?: Readonly<
    Record<string, Readonly<string | number | boolean | null>>
  >;
  public abstract readonly commandName: string;
  private readonly _occurredAt: Date;

  protected constructor(props: Partial<CommandProps> = {}) {
    this.commandId = props.commandId ?? createCommandId();
    this._occurredAt = new Date((props.occurredAt ?? new Date()).getTime());
    this.correlationId = props.correlationId;
    this.causationId = props.causationId;
    this.metadata = props.metadata
      ? Object.freeze({ ...props.metadata })
      : undefined;
  }

  public get occurredAt(): Date {
    return new Date(this._occurredAt.getTime());
  }
}
