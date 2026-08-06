import type { Command } from './command';

/**
 * Dispatches commands to their registered handlers.
 * Implementation belongs in platform (e.g. NestJS CQRS module adapter).
 */
export interface CommandBus {
  execute<TResult = void>(command: Command): Promise<TResult>;
}
