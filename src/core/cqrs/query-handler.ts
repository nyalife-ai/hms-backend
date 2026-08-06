import type { Query } from './query';

/**
 * Handles a single query type and returns a typed read-model result.
 */
export interface QueryHandler<TQuery extends Query, TResult> {
  readonly queryType: string;
  execute(query: TQuery): Promise<TResult>;
}
