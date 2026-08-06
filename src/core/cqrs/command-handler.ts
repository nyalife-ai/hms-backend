import type { Command } from './command';

/**
 * Handles a single command type and returns a typed result.
 */
export interface CommandHandler<TCommand extends Command, TResult = void> {
  readonly commandType: string;
  execute(command: TCommand): Promise<TResult>;
}
