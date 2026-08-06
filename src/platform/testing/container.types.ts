export interface TestContainer {
  start(): Promise<void>;
  stop(): Promise<void>;
  getConnectionUri(): string;
}

export interface PostgresContainerDriver {
  createPostgresContainer(): TestContainer;
}

export interface RedisContainerDriver {
  createRedisContainer(): TestContainer;
}

export interface TestConnectionInfo {
  readonly connectionUri: string;
  readonly container: TestContainer;
}
