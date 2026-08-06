import { RetryPolicy } from '../webhooks/webhook.types';

export interface ExponentialBackoffRetryOptions {
  readonly maxAttempts?: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  /** Jitter factor in [0, 1]. Defaults to 0.2. */
  readonly jitter?: number;
  readonly random?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

/**
 * Retry policy with exponential backoff and full jitter.
 * Preferred production default for webhook delivery.
 */
export class ExponentialBackoffRetryPolicy implements RetryPolicy {
  public readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly jitter: number;
  private readonly random: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  public constructor(options: ExponentialBackoffRetryOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? 5;
    this.baseDelayMs = options.baseDelayMs ?? 100;
    this.maxDelayMs = options.maxDelayMs ?? 30_000;
    this.jitter = options.jitter ?? 0.2;
    this.random = options.random ?? Math.random;
    this.sleep =
      options.sleep ??
      ((milliseconds: number): Promise<void> =>
        new Promise((resolve) => {
          setTimeout(resolve, milliseconds);
        }));
    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1) {
      throw new RangeError('maxAttempts must be a positive integer');
    }
    if (!Number.isFinite(this.baseDelayMs) || this.baseDelayMs < 0) {
      throw new RangeError('baseDelayMs must be a non-negative finite number');
    }
    if (
      !Number.isFinite(this.maxDelayMs) ||
      this.maxDelayMs < this.baseDelayMs
    ) {
      throw new RangeError('maxDelayMs must be finite and >= baseDelayMs');
    }
    if (!Number.isFinite(this.jitter) || this.jitter < 0 || this.jitter > 1) {
      throw new RangeError('jitter must be between zero and one');
    }
  }

  public delay(attempt: number): Promise<void> {
    if (!Number.isInteger(attempt) || attempt < 1) {
      return Promise.reject(
        new RangeError('attempt must be a positive integer'),
      );
    }
    const exponential = Math.min(
      this.maxDelayMs,
      this.baseDelayMs * 2 ** (attempt - 1),
    );
    const variation = exponential * this.jitter * (this.random() * 2 - 1);
    const milliseconds = Math.max(0, exponential + variation);
    return this.sleep(milliseconds);
  }
}
