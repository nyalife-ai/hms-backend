export type JobStatus =
  'waiting' | 'active' | 'completed' | 'failed' | 'paused';

export interface Job<TPayload> {
  readonly id: string;
  readonly payload: TPayload;
  readonly createdAt: Date;
  readonly priority: number;
  attempts: number;
  readonly maxAttempts: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface JobOptions {
  readonly priority?: number;
  readonly maxAttempts?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
