import type { Query } from './query';

/**
 * Dispatches queries to their registered handlers.
 * Implementation belongs in platform.
 */
export interface QueryBus {
  execute<TResult>(query: Query): Promise<TResult>;
}
