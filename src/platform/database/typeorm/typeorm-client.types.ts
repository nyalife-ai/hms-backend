export interface QueryRunnerLike {
  connect(): Promise<void>;
  startTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;
  release(): Promise<void>;
  query(query: string, parameters?: readonly unknown[]): Promise<unknown>;
}

export interface DataSourceLike {
  readonly isInitialized?: boolean;
  initialize(): Promise<unknown>;
  destroy(): Promise<void>;
  query(query: string, parameters?: readonly unknown[]): Promise<unknown>;
  createQueryRunner(): QueryRunnerLike;
}
