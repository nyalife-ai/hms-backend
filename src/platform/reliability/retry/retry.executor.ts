import { Injectable } from '@nestjs/common';
import { RetryPolicy } from './retry.policy';

export type RetrySleeper = (milliseconds: number) => Promise<void>;

const sleep: RetrySleeper = (milliseconds: number): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

@Injectable()
export class RetryExecutor {
  public constructor(private readonly sleeper: RetrySleeper = sleep) {}

  public async execute<T>(
    operation: (attempt: number) => Promise<T> | T,
    policy: RetryPolicy,
  ): Promise<T> {
    let attempt = 1;
    while (true) {
      try {
        return await operation(attempt);
      } catch (error: unknown) {
        if (!policy.shouldRetry(error, attempt)) {
          throw error;
        }
        const delay = policy.delayAfter(attempt);
        if (delay > 0) {
          await this.sleeper(delay);
        }
        attempt += 1;
      }
    }
  }
}
