export type RetryBackoff = 'fixed' | 'exponential';
export type RetryablePredicate = (error: unknown, attempt: number) => boolean;

export interface RetryPolicyOptions {
  readonly maxAttempts?: number;
  readonly delayMs?: number;
  readonly backoff?: RetryBackoff;
  readonly jitter?: number;
  readonly retryable?: RetryablePredicate;
  readonly random?: () => number;
}

export class RetryPolicy {
  public readonly maxAttempts: number;
  private readonly delayMs: number;
  private readonly backoff: RetryBackoff;
  private readonly jitter: number;
  private readonly retryable: RetryablePredicate;
  private readonly random: () => number;

  public constructor(options: RetryPolicyOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? 3;
    this.delayMs = options.delayMs ?? 100;
    this.backoff = options.backoff ?? 'exponential';
    this.jitter = options.jitter ?? 0;
    this.retryable = options.retryable ?? (() => true);
    this.random = options.random ?? Math.random;

    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1) {
      throw new RangeError('maxAttempts must be a positive integer');
    }
    if (!Number.isFinite(this.delayMs) || this.delayMs < 0) {
      throw new RangeError('delayMs must be a non-negative finite number');
    }
    if (!Number.isFinite(this.jitter) || this.jitter < 0 || this.jitter > 1) {
      throw new RangeError('jitter must be between zero and one');
    }
  }

  public shouldRetry(error: unknown, attempt: number): boolean {
    return attempt < this.maxAttempts && this.retryable(error, attempt);
  }

  public delayAfter(attempt: number): number {
    if (!Number.isInteger(attempt) || attempt < 1) {
      throw new RangeError('attempt must be a positive integer');
    }
    const baseDelay =
      this.backoff === 'exponential'
        ? this.delayMs * 2 ** (attempt - 1)
        : this.delayMs;
    const adjustment = baseDelay * this.jitter * (this.random() * 2 - 1);
    return Math.max(0, Math.round(baseDelay + adjustment));
  }
}
