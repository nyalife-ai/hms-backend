export interface Timer {
  readonly set: (callback: () => void, milliseconds: number) => unknown;
  readonly clear: (handle: unknown) => void;
}
export type Sleeper = (milliseconds: number) => Promise<void>;
export interface RetryOptions {
  readonly attempts: number;
  readonly delayMs?: number;
  readonly backoff?: number;
  readonly shouldRetry?: (error: unknown, attempt: number) => boolean;
}

export type WithTimeoutOptions = {
  readonly message?: string;
  readonly signal?: AbortSignal;
};

export const sleep = (milliseconds: number, timer: Timer): Promise<void> => {
  if (milliseconds < 0)
    return Promise.reject(new RangeError('Delay cannot be negative'));
  return new Promise((resolve) => timer.set(resolve, milliseconds));
};

/**
 * Race a promise against a timeout.
 *
 * Existing call sites that pass a string `message` are unchanged.
 * Pass {@link WithTimeoutOptions} to also abort early via `AbortSignal`.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
  timer: Timer,
  message?: string,
): Promise<T>;
export function withTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
  timer: Timer,
  options: WithTimeoutOptions,
): Promise<T>;
export function withTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
  timer: Timer,
  messageOrOptions: string | WithTimeoutOptions = 'Operation timed out',
): Promise<T> {
  if (milliseconds < 0)
    return Promise.reject(new RangeError('Timeout cannot be negative'));

  const message =
    typeof messageOrOptions === 'string'
      ? messageOrOptions
      : (messageOrOptions.message ?? 'Operation timed out');
  const signal =
    typeof messageOrOptions === 'string' ? undefined : messageOrOptions.signal;

  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new Error(
              signal.reason === undefined
                ? 'Operation aborted'
                : String(signal.reason),
            ),
      );
      return;
    }

    const handle = timer.set(() => reject(new Error(message)), milliseconds);

    const onAbort = (): void => {
      timer.clear(handle);
      reject(
        signal?.reason instanceof Error
          ? signal.reason
          : new Error(
              signal?.reason === undefined
                ? 'Operation aborted'
                : String(signal.reason),
            ),
      );
    };

    signal?.addEventListener('abort', onAbort, { once: true });

    const settle = (callback: () => void): void => {
      timer.clear(handle);
      signal?.removeEventListener('abort', onAbort);
      callback();
    };

    promise.then(
      (value) => {
        settle(() => resolve(value));
      },
      (error: unknown) => {
        settle(() =>
          reject(error instanceof Error ? error : new Error(String(error))),
        );
      },
    );
  });
}

/**
 * Explicit AbortSignal-aware timeout helper (same behavior as
 * `withTimeout(promise, ms, timer, { signal, message })`).
 */
export const withCancellableTimeout = <T>(
  promise: Promise<T>,
  milliseconds: number,
  timer: Timer,
  options: WithTimeoutOptions = {},
): Promise<T> => withTimeout(promise, milliseconds, timer, options);

export const retryAsync = async <T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions,
  sleeper: Sleeper,
): Promise<T> => {
  if (!Number.isInteger(options.attempts) || options.attempts < 1)
    throw new RangeError('Attempts must be positive');
  const delay = options.delayMs ?? 0;
  const backoff = options.backoff ?? 1;
  let attempt = 1;
  for (;;) {
    try {
      return await operation(attempt);
    } catch (error: unknown) {
      if (
        attempt === options.attempts ||
        options.shouldRetry?.(error, attempt) === false
      )
        throw error;
      await sleeper(delay * backoff ** (attempt - 1));
      attempt += 1;
    }
  }
};

export const allSettledMap = <T, U>(
  items: readonly T[],
  mapper: (item: T, index: number) => Promise<U>,
): Promise<PromiseSettledResult<U>[]> => Promise.allSettled(items.map(mapper));

export const mapConcurrent = async <T, U>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<U>,
): Promise<U[]> => {
  if (!Number.isInteger(limit) || limit < 1)
    throw new RangeError('Concurrency limit must be positive');
  const output = new Array<U>(items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(items[index], index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return output;
};
