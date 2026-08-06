import { Test } from '@nestjs/testing';
import { NEVER, of, throwError } from 'rxjs';
import {
  ActiveRequestInterceptor,
  ActiveRequestTracker,
  CircuitBreaker,
  CircuitBreakerOpenError,
  DISTRIBUTED_LOCK,
  DistributedLock,
  GracefulShutdownService,
  InMemoryDistributedLock,
  InMemoryServiceRegistry,
  ProcessSignalEmitter,
  RedisClientLike,
  RedisDistributedLock,
  ReliabilityModule,
  RetryExecutor,
  RetryPolicy,
  ShutdownLogger,
  TimeoutScheduler,
} from '..';

class ManualScheduler implements TimeoutScheduler {
  private nextId = 0;
  private readonly callbacks = new Map<number, () => void>();
  private readonly allCallbacks = new Map<number, () => void>();
  public readonly cancelled: unknown[] = [];

  public schedule(callback: () => void, _milliseconds: number): number {
    this.nextId += 1;
    this.callbacks.set(this.nextId, callback);
    this.allCallbacks.set(this.nextId, callback);
    return this.nextId;
  }

  public cancel(handle: unknown): void {
    this.cancelled.push(handle);
    if (typeof handle === 'number') {
      this.callbacks.delete(handle);
    }
  }

  public fire(handle: number): void {
    this.allCallbacks.get(handle)?.();
  }

  public fireNext(): void {
    const entry = this.callbacks.entries().next().value as
      readonly [number, () => void] | undefined;
    entry?.[1]();
  }
}

class FakeEmitter implements ProcessSignalEmitter {
  public readonly listeners = new Map<string, () => void>();
  public readonly removed: string[] = [];

  public on(signal: 'SIGTERM' | 'SIGINT', listener: () => void): void {
    this.listeners.set(signal, listener);
  }

  public off(signal: 'SIGTERM' | 'SIGINT', _listener: () => void): void {
    this.removed.push(signal);
    this.listeners.delete(signal);
  }

  public emit(signal: 'SIGTERM' | 'SIGINT'): void {
    this.listeners.get(signal)?.();
  }
}

const flush = async (): Promise<void> => {
  for (let iteration = 0; iteration < 10; iteration += 1) {
    await Promise.resolve();
  }
};

describe('CircuitBreaker', () => {
  it('validates configuration and tracks failures in closed state', async () => {
    const clock = { timestamp: (): number => 0 };
    expect(
      () =>
        new CircuitBreaker({
          failureThreshold: 0,
          resetTimeoutMs: 1,
          clock,
        }),
    ).toThrow(RangeError);
    expect(
      () =>
        new CircuitBreaker({
          failureThreshold: 1.5,
          resetTimeoutMs: 1,
          clock,
        }),
    ).toThrow(RangeError);
    expect(
      () =>
        new CircuitBreaker({
          failureThreshold: 1,
          resetTimeoutMs: Number.NaN,
          clock,
        }),
    ).toThrow(RangeError);
    expect(
      () =>
        new CircuitBreaker({
          failureThreshold: 1,
          resetTimeoutMs: -1,
          clock,
        }),
    ).toThrow(RangeError);

    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 10,
      clock,
    });
    await expect(
      breaker.execute((): never => {
        throw new Error('first');
      }),
    ).rejects.toThrow('first');
    await expect(breaker.execute((): string => 'healthy')).resolves.toBe(
      'healthy',
    );
    await expect(
      breaker.execute((): Promise<never> => Promise.reject(new Error('one'))),
    ).rejects.toThrow('one');
    await expect(
      breaker.execute((): Promise<never> => Promise.reject(new Error('two'))),
    ).rejects.toThrow('two');
    expect(breaker.state).toBe('open');
    await expect(
      breaker.execute((): string => 'blocked'),
    ).rejects.toBeInstanceOf(CircuitBreakerOpenError);
  });

  it('allows one half-open trial and recovers without races', async () => {
    let now = 0;
    const transitions: string[] = [];
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 5,
      clock: { timestamp: (): number => now },
      onStateChange: (previous, current): void => {
        transitions.push(`${previous}:${current}`);
      },
    });
    await expect(
      breaker.execute((): Promise<never> => Promise.reject(new Error('down'))),
    ).rejects.toThrow('down');
    now = 5;
    expect(breaker.state).toBe('half-open');

    let resolveTrial: ((value: string) => void) | undefined;
    const trial = breaker.execute(
      (): Promise<string> =>
        new Promise<string>((resolve) => {
          resolveTrial = resolve;
        }),
    );
    await expect(
      breaker.execute((): string => 'racing'),
    ).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    resolveTrial?.('recovered');
    await expect(trial).resolves.toBe('recovered');
    expect(breaker.state).toBe('closed');
    expect(transitions).toEqual([
      'closed:open',
      'open:half-open',
      'half-open:closed',
    ]);
  });

  it('reopens after a failed half-open trial', async () => {
    let now = 0;
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 2,
      clock: { timestamp: (): number => now },
    });
    await expect(
      breaker.execute((): never => {
        throw new Error('down');
      }),
    ).rejects.toThrow('down');
    now = 2;
    await expect(
      breaker.execute((): never => {
        throw new Error('still down');
      }),
    ).rejects.toThrow('still down');
    expect(breaker.state).toBe('open');
    now = 4;
    await expect(breaker.execute((): number => 7)).resolves.toBe(7);
    expect(breaker.state).toBe('closed');
  });
});

describe('retry', () => {
  it('validates policy and computes fixed, exponential, and jitter delays', () => {
    expect(() => new RetryPolicy({ maxAttempts: 0 })).toThrow(RangeError);
    expect(() => new RetryPolicy({ maxAttempts: 1.2 })).toThrow(RangeError);
    expect(() => new RetryPolicy({ delayMs: -1 })).toThrow(RangeError);
    expect(() => new RetryPolicy({ delayMs: Number.NaN })).toThrow(RangeError);
    expect(() => new RetryPolicy({ jitter: -0.1 })).toThrow(RangeError);
    expect(() => new RetryPolicy({ jitter: 1.1 })).toThrow(RangeError);

    const defaults = new RetryPolicy();
    expect(defaults.delayAfter(2)).toBe(200);
    expect(() => defaults.delayAfter(0)).toThrow(RangeError);
    expect(() => defaults.delayAfter(1.2)).toThrow(RangeError);
    expect(defaults.shouldRetry(new Error('x'), 1)).toBe(true);
    expect(defaults.shouldRetry(new Error('x'), 3)).toBe(false);

    expect(
      new RetryPolicy({
        delayMs: 10,
        backoff: 'fixed',
        jitter: 1,
        random: (): number => 0,
      }).delayAfter(1),
    ).toBe(0);
    expect(
      new RetryPolicy({
        delayMs: 10,
        jitter: 0.5,
        random: (): number => 1,
      }).delayAfter(2),
    ).toBe(30);
  });

  it('retries failures, sleeps, and returns after recovery', async () => {
    const delays: number[] = [];
    const attempts: number[] = [];
    const executor = new RetryExecutor((delay: number): Promise<void> => {
      delays.push(delay);
      return Promise.resolve();
    });
    const result = await executor.execute(
      (attempt: number): string => {
        attempts.push(attempt);
        if (attempt < 3) {
          throw new Error('transient');
        }
        return 'ok';
      },
      new RetryPolicy({ maxAttempts: 3, delayMs: 5 }),
    );
    expect(result).toBe('ok');
    expect(attempts).toEqual([1, 2, 3]);
    expect(delays).toEqual([5, 10]);
  });

  it('does not sleep at zero delay and aborts non-retryable errors', async () => {
    const sleeper = jest.fn<Promise<void>, [number]>(() => Promise.resolve());
    const executor = new RetryExecutor(sleeper);
    const fatal = new Error('fatal');
    const policy = new RetryPolicy({
      maxAttempts: 3,
      delayMs: 0,
      retryable: (error: unknown): boolean => error !== fatal,
    });
    await expect(
      executor.execute((): Promise<never> => Promise.reject(fatal), policy),
    ).rejects.toBe(fatal);
    expect(sleeper).not.toHaveBeenCalled();

    let attempts = 0;
    await expect(
      executor.execute(
        (): never => {
          attempts += 1;
          throw new Error('always');
        },
        new RetryPolicy({ maxAttempts: 2, delayMs: 0 }),
      ),
    ).rejects.toThrow('always');
    expect(attempts).toBe(2);
  });
});

describe('InMemoryServiceRegistry', () => {
  it('maintains healthy instances and selects them round-robin', () => {
    const registry = new InMemoryServiceRegistry();
    expect(() =>
      registry.register({
        id: '1',
        serviceName: '',
        endpoint: 'a',
        healthy: true,
      }),
    ).toThrow(TypeError);
    expect(() =>
      registry.register({
        id: '',
        serviceName: 'api',
        endpoint: 'a',
        healthy: true,
      }),
    ).toThrow(TypeError);
    expect(registry.pick('missing')).toBeUndefined();
    expect(registry.deregister('missing', '1')).toBe(false);

    registry.register({
      id: '1',
      serviceName: 'api',
      endpoint: 'one',
      healthy: true,
    });
    registry.register({
      id: '2',
      serviceName: 'api',
      endpoint: 'two',
      healthy: false,
    });
    registry.register({
      id: '3',
      serviceName: 'api',
      endpoint: 'three',
      healthy: true,
    });
    expect(Object.isFrozen(registry.resolve('api'))).toBe(true);
    expect(registry.resolve('api').map((instance) => instance.id)).toEqual([
      '1',
      '3',
    ]);
    expect(registry.pick('api')?.id).toBe('1');
    expect(registry.pick('api')?.id).toBe('3');
    expect(registry.pick('api')?.id).toBe('1');

    registry.register({
      id: '2',
      serviceName: 'api',
      endpoint: 'two',
      healthy: true,
    });
    expect(registry.deregister('api', 'missing')).toBe(false);
    expect(registry.deregister('api', '1')).toBe(true);
    expect(registry.deregister('api', '2')).toBe(true);
    expect(registry.deregister('api', '3')).toBe(true);
    expect(registry.resolve('api')).toEqual([]);
  });
});

describe('distributed locks', () => {
  it('handles contention, renewal, expiry, and token ownership in memory', async () => {
    let now = 0;
    let tokenNumber = 0;
    const lock = new InMemoryDistributedLock(
      (): number => now,
      (): string => `token-${++tokenNumber}`,
    );
    expect(() => lock.acquire('', 1)).toThrow(TypeError);
    expect(() => lock.acquire('key', 0)).toThrow(RangeError);
    expect(() => lock.acquire('key', Number.NaN)).toThrow(RangeError);

    const token = await lock.acquire('key', 10);
    expect(token).toBe('token-1');
    await expect(lock.acquire('key', 10)).resolves.toBeUndefined();
    await expect(lock.release('key', 'wrong')).resolves.toBe(false);
    await expect(lock.renew('key', 'wrong', 10)).resolves.toBe(false);
    await expect(lock.renew('key', token ?? '', 20)).resolves.toBe(true);
    now = 15;
    await expect(lock.acquire('key', 10)).resolves.toBeUndefined();
    now = 21;
    await expect(lock.release('key', token ?? '')).resolves.toBe(false);
    const replacement = await lock.acquire('key', 10);
    await expect(lock.release('key', replacement ?? '')).resolves.toBe(true);
    await expect(lock.release('missing', 'x')).resolves.toBe(false);
    expect(() => lock.renew('', 'x', 1)).toThrow(TypeError);
    expect(() => lock.renew('key', 'x', -1)).toThrow(RangeError);

    const defaultLock = new InMemoryDistributedLock();
    await expect(defaultLock.acquire('default', 1)).resolves.toEqual(
      expect.any(String),
    );
  });

  it('uses atomic Redis commands for acquire, release, and renew', async () => {
    const client: RedisClientLike = {
      set: jest.fn<Promise<'OK' | null>, [string, string, 'PX', number, 'NX']>(
        () => Promise.resolve('OK'),
      ),
      eval: jest.fn<Promise<unknown>, [string, number, ...string[]]>(() =>
        Promise.resolve(1),
      ),
    };
    const lock = new RedisDistributedLock(client, (): string => 'token');
    await expect(lock.acquire('', 1)).rejects.toThrow(TypeError);
    await expect(lock.acquire('key', 0)).rejects.toThrow(RangeError);
    await expect(lock.acquire('key', Number.NaN)).rejects.toThrow(RangeError);
    await expect(lock.acquire('key', 10)).resolves.toBe('token');
    await expect(lock.release('key', 'token')).resolves.toBe(true);
    await expect(lock.renew('key', 'token', 20)).resolves.toBe(true);
    expect(client.eval).toHaveBeenLastCalledWith(
      expect.stringContaining('pexpire'),
      1,
      'key',
      'token',
      '20',
    );

    const missClient: RedisClientLike = {
      set: (): Promise<null> => Promise.resolve(null),
      eval: (): Promise<number> => Promise.resolve(0),
    };
    const missed = new RedisDistributedLock(missClient);
    await expect(missed.acquire('key', 1)).resolves.toBeUndefined();
    await expect(missed.release('key', 'wrong')).resolves.toBe(false);
    await expect(missed.renew('key', 'wrong', 1)).resolves.toBe(false);
    await expect(missed.renew('', 'wrong', 1)).rejects.toThrow(TypeError);
    await expect(missed.renew('key', 'wrong', -1)).rejects.toThrow(RangeError);
  });
});

describe('ActiveRequestTracker', () => {
  it('drains concurrent waiters and prevents underflow', async () => {
    const scheduler = new ManualScheduler();
    const tracker = new ActiveRequestTracker(scheduler);
    expect(tracker.count).toBe(0);
    await expect(tracker.drain(1)).resolves.toBe(true);
    await expect(tracker.drain(-1)).rejects.toThrow(RangeError);
    await expect(tracker.drain(Number.NaN)).rejects.toThrow(RangeError);
    expect(() => tracker.decrement()).toThrow(
      'Active request count cannot be negative',
    );

    tracker.increment();
    tracker.increment();
    const first = tracker.drain(10);
    const second = tracker.drain(10);
    tracker.decrement();
    expect(tracker.count).toBe(1);
    tracker.decrement();
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(scheduler.cancelled).toHaveLength(2);
  });

  it('times out deterministically and ignores repeated timer callbacks', async () => {
    const scheduler = new ManualScheduler();
    const tracker = new ActiveRequestTracker(scheduler);
    tracker.increment();
    const draining = tracker.drain(5);
    scheduler.fire(1);
    scheduler.fire(1);
    await expect(draining).resolves.toBe(false);
    tracker.decrement();
  });
});

describe('ActiveRequestInterceptor', () => {
  it('tracks completion, error, unsubscribe, and synchronous failures', () => {
    const tracker = new ActiveRequestTracker();
    const interceptor = new ActiveRequestInterceptor(tracker);
    interceptor.intercept({} as never, { handle: () => of('ok') }).subscribe();
    expect(tracker.count).toBe(0);

    interceptor
      .intercept({} as never, {
        handle: () => throwError(() => new Error('failed')),
      })
      .subscribe({ error: (): void => undefined });
    expect(tracker.count).toBe(0);

    const subscription = interceptor
      .intercept({} as never, { handle: () => NEVER })
      .subscribe();
    expect(tracker.count).toBe(1);
    subscription.unsubscribe();
    expect(tracker.count).toBe(0);

    expect(() =>
      interceptor.intercept({} as never, {
        handle: (): never => {
          throw new Error('synchronous');
        },
      }),
    ).toThrow('synchronous');
    expect(tracker.count).toBe(0);
  });
});

describe('GracefulShutdownService', () => {
  const createLogger = (): ShutdownLogger => ({
    error: jest.fn<void, [string, unknown?]>(),
  });

  it('validates options and hook registration', async () => {
    const tracker = new ActiveRequestTracker(new ManualScheduler());
    expect(
      () =>
        new GracefulShutdownService(
          tracker,
          new FakeEmitter(),
          createLogger(),
          new ManualScheduler(),
          { hookTimeoutMs: -1 },
        ),
    ).toThrow(RangeError);
    expect(
      () =>
        new GracefulShutdownService(
          tracker,
          new FakeEmitter(),
          createLogger(),
          new ManualScheduler(),
          { drainTimeoutMs: Number.NaN },
        ),
    ).toThrow(RangeError);

    const service = new GracefulShutdownService(
      tracker,
      new FakeEmitter(),
      createLogger(),
      new ManualScheduler(),
    );
    expect(() => service.register('', (): void => undefined)).toThrow(
      TypeError,
    );
    expect(() =>
      service.register('bad-order', (): void => undefined, Number.NaN),
    ).toThrow(RangeError);
    const unregister = service.register('removed', (): void => undefined);
    unregister();
    await service.shutdown();
    expect(() => service.register('late', (): void => undefined)).toThrow(
      'Cannot register',
    );
    expect(service.shutdown()).toBe(service.shutdown());
  });

  it('orders hooks, isolates failures and timeouts, and handles signals', async () => {
    const tracker = new ActiveRequestTracker(new ManualScheduler());
    const emitter = new FakeEmitter();
    const logger = createLogger();
    const hookTimers = new ManualScheduler();
    const calls: string[] = [];
    let finishSlow: (() => void) | undefined;
    const service = new GracefulShutdownService(
      tracker,
      emitter,
      logger,
      hookTimers,
      { hookTimeoutMs: 5, drainTimeoutMs: 10 },
    );
    service.onModuleInit();
    service.onModuleInit();
    service.register(
      'last',
      (): void => {
        calls.push('last');
      },
      3,
    );
    service.register(
      'first',
      (): void => {
        calls.push('replaced');
      },
      0,
    );
    service.register(
      'first',
      (): void => {
        calls.push('first');
      },
      1,
    );
    service.register(
      'failure',
      (): never => {
        calls.push('failure');
        throw new Error('hook failed');
      },
      2,
    );
    service.register(
      'timeout',
      (): Promise<void> =>
        new Promise<void>((resolve) => {
          calls.push('timeout');
          finishSlow = resolve;
        }),
      2,
    );

    emitter.emit('SIGTERM');
    await flush();
    expect(calls).toEqual(['first', 'failure', 'timeout']);
    hookTimers.fireNext();
    await flush();
    finishSlow?.();
    await service.shutdown();
    expect(calls).toEqual(['first', 'failure', 'timeout', 'last']);
    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(emitter.removed).toEqual(['SIGTERM', 'SIGINT']);
    emitter.emit('SIGINT');
  });

  it('logs drain timeout and can destroy before initialization', async () => {
    const drainTimers = new ManualScheduler();
    const tracker = new ActiveRequestTracker(drainTimers);
    tracker.increment();
    const logger = createLogger();
    const service = new GracefulShutdownService(
      tracker,
      new FakeEmitter(),
      logger,
      new ManualScheduler(),
      { drainTimeoutMs: 1 },
    );
    const shutdown = service.onModuleDestroy();
    drainTimers.fireNext();
    await shutdown;
    expect(logger.error).toHaveBeenCalledWith(
      'Active requests did not drain within 1ms',
    );
    tracker.decrement();
  });

  it('normalizes non-Error hook failures for logging', async () => {
    const tracker = new ActiveRequestTracker(new ManualScheduler());
    const logger = createLogger();
    const service = new GracefulShutdownService(
      tracker,
      new FakeEmitter(),
      logger,
      new ManualScheduler(),
    );
    service.register('string-fail', (): never => {
      throw 'boom';
    });
    service.register('number-fail', (): never => {
      throw 42;
    });
    service.register('bool-fail', (): never => {
      throw false;
    });
    service.register('bigint-fail', (): never => {
      throw 9n;
    });
    service.register('object-fail', (): never => {
      throw { ok: false };
    });
    const circular: { self?: unknown } = {};
    circular.self = circular;
    service.register('circular-fail', (): never => {
      throw circular;
    });
    await service.shutdown();
    expect(logger.error).toHaveBeenCalled();
  });

  it('supports the default timer and process adapters deterministically', async () => {
    jest.useFakeTimers();
    let attempts = 0;
    const retried = new RetryExecutor().execute(
      (): string => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('retry');
        }
        return 'recovered';
      },
      new RetryPolicy({ delayMs: 1 }),
    );
    await flush();
    jest.advanceTimersByTime(1);
    await expect(retried).resolves.toBe('recovered');

    const tracker = new ActiveRequestTracker();
    tracker.increment();
    const drain = tracker.drain(1);
    jest.advanceTimersByTime(1);
    await expect(drain).resolves.toBe(false);
    tracker.decrement();

    const service = new GracefulShutdownService(
      new ActiveRequestTracker(),
      undefined,
      createLogger(),
      undefined,
      { hookTimeoutMs: 1 },
    );
    service.onModuleInit();
    service.register(
      'pending',
      (): Promise<void> => new Promise<void>(() => undefined),
    );
    const shutdown = service.onModuleDestroy();
    await flush();
    jest.advanceTimersByTime(1);
    await shutdown;
    jest.useRealTimers();
  });
});

describe('ReliabilityModule', () => {
  it('provides default and Redis-backed infrastructure', async () => {
    expect(ReliabilityModule.register().module).toBe(ReliabilityModule);
    const defaultModule = await Test.createTestingModule({
      imports: [ReliabilityModule.register({ globalRequestTracking: true })],
    }).compile();
    expect(defaultModule.get(ActiveRequestTracker)).toBeInstanceOf(
      ActiveRequestTracker,
    );
    expect(defaultModule.get(RetryExecutor)).toBeInstanceOf(RetryExecutor);
    expect(defaultModule.get(ActiveRequestInterceptor)).toBeInstanceOf(
      ActiveRequestInterceptor,
    );
    expect(defaultModule.get(InMemoryServiceRegistry)).toBeInstanceOf(
      InMemoryServiceRegistry,
    );
    expect(defaultModule.get<DistributedLock>(DISTRIBUTED_LOCK)).toBeInstanceOf(
      InMemoryDistributedLock,
    );
    expect(defaultModule.get(GracefulShutdownService)).toBeInstanceOf(
      GracefulShutdownService,
    );
    await defaultModule.close();

    const redisClient: RedisClientLike = {
      set: (): Promise<null> => Promise.resolve(null),
      eval: (): Promise<number> => Promise.resolve(0),
    };
    const redisModule = await Test.createTestingModule({
      imports: [
        ReliabilityModule.register({
          redisClient,
          shutdown: { drainTimeoutMs: 2 },
        }),
      ],
    }).compile();
    expect(redisModule.get<DistributedLock>(DISTRIBUTED_LOCK)).toBeInstanceOf(
      RedisDistributedLock,
    );
    await redisModule.close();
  });

  it('fails fast in production HA without distributed lock and registry', () => {
    expect(() => ReliabilityModule.register({ isProduction: true })).toThrow(
      /distributed lock/,
    );
    expect(() =>
      ReliabilityModule.register({
        isProduction: true,
        redisClient: {
          set: (): Promise<'OK'> => Promise.resolve('OK'),
          eval: (): Promise<number> => Promise.resolve(1),
        },
      }),
    ).toThrow(/serviceRegistry/);
    expect(() =>
      ReliabilityModule.register({
        isProduction: true,
        enableHa: false,
      }),
    ).not.toThrow();
    expect(() =>
      ReliabilityModule.register({
        isProduction: true,
        allowInMemory: true,
      }),
    ).not.toThrow();
    expect(() =>
      ReliabilityModule.register({
        isProduction: true,
        lock: new InMemoryDistributedLock(),
        serviceRegistry: new InMemoryServiceRegistry(),
      }),
    ).toThrow(/InMemoryDistributedLock is not safe/);
    expect(() =>
      ReliabilityModule.register({
        isProduction: true,
        redisClient: {
          set: (): Promise<'OK'> => Promise.resolve('OK'),
          eval: (): Promise<number> => Promise.resolve(1),
        },
        serviceRegistry: new InMemoryServiceRegistry(),
      }),
    ).toThrow(/InMemoryServiceRegistry is not suitable/);
    const externalLock: DistributedLock = {
      acquire: async () => 'token',
      release: async () => true,
      renew: async () => true,
    };
    const externalRegistry = {
      register: (): void => undefined,
      deregister: (): boolean => true,
      resolve: (): never[] => [],
      pick: (): undefined => undefined,
    };
    expect(() =>
      ReliabilityModule.register({
        isProduction: true,
        lock: externalLock,
        serviceRegistry: externalRegistry,
      }),
    ).not.toThrow();
    expect(() => new InMemoryServiceRegistry({ maxInstances: 0 })).toThrow(
      RangeError,
    );
    const registry = new InMemoryServiceRegistry({ maxInstances: 1 });
    registry.register({
      id: '1',
      serviceName: 'api',
      endpoint: 'http://127.0.0.1:1',
      healthy: true,
    });
    expect(() =>
      registry.register({
        id: '2',
        serviceName: 'api',
        endpoint: 'http://127.0.0.1:2',
        healthy: true,
      }),
    ).toThrow(/full/);
  });
});
