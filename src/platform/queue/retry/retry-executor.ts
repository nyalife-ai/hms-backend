import { Injectable } from '@nestjs/common';
import { RetryPolicy } from './retry-policy';

export type Sleeper = (milliseconds: number) => Promise<void>;

const defaultSleeper: Sleeper = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

@Injectable()
export class RetryExecutor {
  public constructor(private readonly sleeper: Sleeper = defaultSleeper) {}

  public async execute<TResult>(
    operation: (attempt: number) => Promise<TResult>,
    policy: RetryPolicy,
  ): Promise<TResult> {
    let attempt = 1;
    while (true) {
      try {
        return await operation(attempt);
      } catch (error: unknown) {
        if (!policy.shouldRetry(error, attempt)) {
          throw error;
        }
        const delay = policy.computeDelay(attempt);
        if (delay > 0) {
          await this.sleeper(delay);
        }
        attempt += 1;
      }
    }
  }
}
