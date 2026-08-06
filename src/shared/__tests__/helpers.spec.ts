import {
  allSettledMap,
  assertDefined,
  assertNever,
  combineResults,
  ensure,
  err,
  fromThrowable,
  isDefined,
  mapConcurrent,
  ok,
  retryAsync,
  sleep,
  unwrapOr,
  withCancellableTimeout,
  withTimeout,
} from '..';
import type { Timer } from '../helpers/async.helpers';

const deferred = <T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
} => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('result and guard helpers', () => {
  it('builds and combines core results', () => {
    expect(ok(1).getValue()).toBe(1);
    expect(err('bad').getError()).toBe('bad');
    expect(fromThrowable(() => 2, String).getValue()).toBe(2);
    expect(
      fromThrowable(() => {
        throw new Error('x');
      }, String).isFailure(),
    ).toBe(true);
    expect(unwrapOr(ok(1), 2)).toBe(1);
    expect(unwrapOr(err('x'), 2)).toBe(2);
    expect(combineResults([ok(1), ok(2)]).getValue()).toEqual([1, 2]);
    expect(combineResults([ok(1), err('x')]).getError()).toBe('x');
    expect(combineResults([]).getValue()).toEqual([]);
  });
  it('narrows values and enforces invariants', () => {
    expect(isDefined(0)).toBe(true);
    expect(isDefined(null)).toBe(false);
    expect(isDefined(undefined)).toBe(false);
    expect(() => assertDefined(null)).toThrow('Value is required');
    expect(() => assertDefined(undefined, 'custom')).toThrow('custom');
    expect(() => assertDefined('x')).not.toThrow();
    expect(() => ensure(false)).toThrow('Invariant failed');
    expect(() => ensure(false, 'custom')).toThrow('custom');
    expect(() => ensure(true)).not.toThrow();
    expect(() => assertNever('bad' as never)).toThrow('Unexpected value: bad');
    expect(() => assertNever(1 as never, 'custom')).toThrow('custom: 1');
  });
});

describe('async helpers', () => {
  it('sleeps using an injected timer and rejects negative delays', async () => {
    let callback: (() => void) | undefined;
    const timer: Timer = {
      set: (cb) => {
        callback = cb;
        return 1;
      },
      clear: jest.fn(),
    };
    const pending = sleep(10, timer);
    callback?.();
    await expect(pending).resolves.toBeUndefined();
    await expect(sleep(-1, timer)).rejects.toThrow(RangeError);
  });

  it('handles timeout success, failure, timeout, and invalid values', async () => {
    const callbacks: (() => void)[] = [];
    const timer: Timer = {
      set: (callback) => {
        callbacks.push(callback);
        return callbacks.length;
      },
      clear: jest.fn(),
    };
    await expect(withTimeout(Promise.resolve('ok'), 10, timer)).resolves.toBe(
      'ok',
    );
    await expect(
      withTimeout(Promise.reject(new Error('fail')), 10, timer),
    ).rejects.toThrow('fail');
    await expect(
      withTimeout(Promise.reject('primitive-fail'), 10, timer),
    ).rejects.toThrow('primitive-fail');
    const never = new Promise<never>(() => undefined);
    const timed = withTimeout(never, 10, timer, 'late');
    callbacks.at(-1)?.();
    await expect(timed).rejects.toThrow('late');
    await expect(withTimeout(never, -1, timer)).rejects.toThrow(RangeError);
    expect(timer.clear).toHaveBeenCalledTimes(3);
  });

  it('supports AbortSignal cancellation for timeouts', async () => {
    const timer: Timer = {
      set: () => 1,
      clear: jest.fn(),
    };
    const never = new Promise<never>(() => undefined);

    const preAborted = {
      aborted: true,
      reason: undefined,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    } as unknown as AbortSignal;
    await expect(
      withTimeout(never, 10, timer, { signal: preAborted }),
    ).rejects.toThrow('Operation aborted');

    const preAbortedError = {
      aborted: true,
      reason: new Error('already-cancelled'),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    } as unknown as AbortSignal;
    await expect(
      withTimeout(never, 10, timer, { signal: preAbortedError }),
    ).rejects.toThrow('already-cancelled');

    const preAbortedReason = {
      aborted: true,
      reason: 'stop-now',
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    } as unknown as AbortSignal;
    await expect(
      withTimeout(never, 10, timer, { signal: preAbortedReason }),
    ).rejects.toThrow('stop-now');

    const listeners = new Map<string, () => void>();
    const liveSignal = {
      aborted: false,
      reason: undefined as unknown,
      addEventListener: (type: string, listener: () => void) => {
        listeners.set(type, listener);
      },
      removeEventListener: (type: string) => {
        listeners.delete(type);
      },
    };
    const pending = withCancellableTimeout(never, 50, timer, {
      signal: liveSignal as unknown as AbortSignal,
      message: 'unused',
    });
    liveSignal.aborted = true;
    listeners.get('abort')?.();
    await expect(pending).rejects.toThrow('Operation aborted');
    expect(timer.clear).toHaveBeenCalled();

    const errorListeners = new Map<string, () => void>();
    const errorSignal = {
      aborted: false,
      reason: new Error('mid-flight') as unknown,
      addEventListener: (type: string, listener: () => void) => {
        errorListeners.set(type, listener);
      },
      removeEventListener: (type: string) => {
        errorListeners.delete(type);
      },
    };
    const pendingError = withTimeout(never, 50, timer, {
      signal: errorSignal as unknown as AbortSignal,
    });
    errorSignal.aborted = true;
    errorListeners.get('abort')?.();
    await expect(pendingError).rejects.toThrow('mid-flight');

    const reasonListeners = new Map<string, () => void>();
    const reasonSignal = {
      aborted: false,
      reason: 42 as unknown,
      addEventListener: (type: string, listener: () => void) => {
        reasonListeners.set(type, listener);
      },
      removeEventListener: (type: string) => {
        reasonListeners.delete(type);
      },
    };
    const pendingReason = withTimeout(never, 50, timer, {
      signal: reasonSignal as unknown as AbortSignal,
    });
    reasonSignal.aborted = true;
    reasonListeners.get('abort')?.();
    await expect(pendingReason).rejects.toThrow('42');

    await expect(
      withTimeout(Promise.resolve('done'), 10, timer, {
        message: 'custom',
      }),
    ).resolves.toBe('done');

    await expect(
      withCancellableTimeout(Promise.resolve('default-options'), 10, timer),
    ).resolves.toBe('default-options');
  });

  it('retries with deterministic delay and recovery', async () => {
    const delays: number[] = [];
    let calls = 0;
    const value = await retryAsync(
      async (attempt) => {
        calls += 1;
        if (attempt < 3) throw new Error('again');
        return 'done';
      },
      { attempts: 3, delayMs: 2, backoff: 3 },
      async (delay) => {
        delays.push(delay);
      },
    );
    expect(value).toBe('done');
    expect(calls).toBe(3);
    expect(delays).toEqual([2, 6]);
    await expect(
      retryAsync(
        async () => {
          throw new Error('stop');
        },
        {
          attempts: 3,
          shouldRetry: () => false,
        },
        async () => undefined,
      ),
    ).rejects.toThrow('stop');
    await expect(
      retryAsync(
        async () => {
          throw new Error('last');
        },
        {
          attempts: 1,
        },
        async () => undefined,
      ),
    ).rejects.toThrow('last');
    await expect(
      retryAsync(
        async () => 1,
        { attempts: 0 },
        async () => undefined,
      ),
    ).rejects.toThrow(RangeError);
  });

  it('settles mappings and enforces concurrency while preserving order', async () => {
    const settled = await allSettledMap([1, 2], async (item, index) => {
      if (index === 1) throw new Error('bad');
      return item;
    });
    expect(settled.map((item) => item.status)).toEqual([
      'fulfilled',
      'rejected',
    ]);

    let active = 0;
    let maximum = 0;
    const gates = [deferred<void>(), deferred<void>(), deferred<void>()];
    const mapped = mapConcurrent([1, 2, 3], 2, async (item, index) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await gates[index].promise;
      active -= 1;
      return item * 2;
    });
    await Promise.resolve();
    expect(active).toBe(2);
    gates[0].resolve();
    await Promise.resolve();
    gates[1].resolve();
    await Promise.resolve();
    gates[2].resolve();
    await expect(mapped).resolves.toEqual([2, 4, 6]);
    expect(maximum).toBe(2);
    await expect(
      mapConcurrent([], 2, async (item: number) => item),
    ).resolves.toEqual([]);
    await expect(mapConcurrent([1], 0, async (item) => item)).rejects.toThrow(
      RangeError,
    );
    await expect(mapConcurrent([1], 1.5, async (item) => item)).rejects.toThrow(
      RangeError,
    );
  });
});
