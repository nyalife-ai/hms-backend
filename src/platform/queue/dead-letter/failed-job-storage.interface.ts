export interface FailedJob {
  readonly jobId: string;
  readonly error: string;
  readonly stack: string | undefined;
  readonly attemptCount: number;
  readonly timestamp: Date;
  readonly payloadMetadata: Readonly<Record<string, unknown>>;
}

export interface FailedJobStorage {
  save(failedJob: FailedJob): Promise<void>;
  list(): Promise<readonly FailedJob[]>;
  purge(): Promise<number>;
}
