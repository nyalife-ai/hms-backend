import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import * as schedulingExports from '../index';
import { SchedulerLock } from '../contracts';
import { CronParser } from '../cron.parser';
import { InMemorySchedulerLock } from '../in-memory-scheduler-lock';
import { SCHEDULER_LOCK, SchedulerModule } from '../scheduler.module';
import { SchedulerService, SchedulerTimer } from '../scheduler.service';

describe('scheduling platform', () => {
  it('matches wildcard, number, list, range, step, and Sunday alias fields', () => {
    const parser = new CronParser('*/15 9-10 1,15 1-12 1-5');
    expect(parser.matches(new Date('2026-06-15T09:30:00Z'))).toBe(true);
    expect(parser.matches(new Date('2026-06-15T09:31:00Z'))).toBe(false);
    expect(parser.matches(new Date('2026-06-14T09:30:00Z'))).toBe(false);
    expect(new CronParser('0 0 * * 7').matches(new Date('2026-07-26'))).toBe(
      true,
    );
    expect(new CronParser('* * * * *').matches(new Date('2026-01-01'))).toBe(
      true,
    );
    expect(
      new CronParser('5 2 5 4 0').matches(new Date('2026-04-05T02:05Z')),
    ).toBe(true);
  });

  it('finds the next run strictly after the supplied instant', () => {
    const everyQuarter = new CronParser('*/15 * * * *');
    expect(everyQuarter.nextRun(new Date('2026-01-01T10:14:59.999Z'))).toEqual(
      new Date('2026-01-01T10:15:00Z'),
    );
    expect(everyQuarter.nextRun(new Date('2026-01-01T10:15:00Z'))).toEqual(
      new Date('2026-01-01T10:30:00Z'),
    );
    expect(
      new CronParser('0 0 1 1 *').nextRun(new Date('2026-01-01T00:00:00Z')),
    ).toEqual(new Date('2027-01-01T00:00:00Z'));
  });

  it('rejects malformed cron expressions and invalid dates', () => {
    expect(() => new CronParser('* * * *')).toThrow(SyntaxError);
    expect(() => new CronParser('*/0 * * * *')).toThrow(RangeError);
    expect(() => new CronParser('10-2 * * * *')).toThrow(RangeError);
    expect(() => new CronParser('60 * * * *')).toThrow(RangeError);
    expect(() => new CronParser('x * * * *')).toThrow(SyntaxError);
    expect(() =>
      new CronParser('* * * * *').matches(new Date(Number.NaN)),
    ).toThrow(RangeError);
    expect(() =>
      new CronParser('* * * * *').nextRun(new Date(Number.NaN)),
    ).toThrow(RangeError);
    expect(() =>
      new CronParser('0 0 30 2 *').nextRun(new Date('2026-01-01T00:00:00Z')),
    ).toThrow('eight years');
  });

  it('enforces scheduler lock ownership, expiry, and input validity', async () => {
    let now = 0;
    let sequence = 0;
    const lock = new InMemorySchedulerLock(
      () => now,
      () => `token-${++sequence}`,
    );
    const first = await lock.acquire('task', 10);
    expect(first).toBe('token-1');
    expect(await lock.acquire('task', 10)).toBeUndefined();
    expect(await lock.release('missing', 'token')).toBe(false);
    expect(await lock.release('task', 'wrong')).toBe(false);
    now = 10;
    const second = await lock.acquire('task', 10);
    expect(second).toBe('token-2');
    expect(await lock.release('task', second as string)).toBe(true);
    await expect(lock.acquire(' ', 1)).rejects.toThrow(TypeError);
    await expect(lock.acquire('task', 0)).rejects.toThrow(RangeError);
    await expect(lock.acquire('task', Number.NaN)).rejects.toThrow(RangeError);

    const bounded = new InMemorySchedulerLock(
      () => now,
      () => `bounded-${++sequence}`,
      { maxEntries: 1 },
    );
    const renewToken = await bounded.acquire('a', 100);
    expect(renewToken).toBeDefined();
    await expect(bounded.acquire('b', 100)).rejects.toThrow(/full/);
    await expect(bounded.renew('a', renewToken as string, 0)).rejects.toThrow(
      RangeError,
    );
    now = 1_000;
    expect(await bounded.renew('a', renewToken as string, 100)).toBe(false);
  });

  it('runs interval tasks, records failure, and recovers', async () => {
    jest.useFakeTimers();
    let now = new Date('2026-01-01T00:00:00Z');
    let calls = 0;
    const scheduler = new SchedulerService(
      new InMemorySchedulerLock(
        () => now.getTime(),
        () => `token-${calls}`,
      ),
      () => new Date(now),
    );
    scheduler.register({
      id: 'interval',
      type: 'interval',
      intervalMs: 10,
      handler: async (): Promise<void> => {
        calls += 1;
        if (calls === 1) {
          throw 'temporary';
        }
      },
    });
    scheduler.start();
    scheduler.start();
    now = new Date(now.getTime() + 10);
    await jest.advanceTimersByTimeAsync(10);
    now = new Date(now.getTime() + 10);
    await jest.advanceTimersByTimeAsync(10);
    expect(calls).toBe(2);
    expect(scheduler.getMetrics()).toEqual({
      executed: 1,
      failed: 1,
      skipped: 0,
    });
    expect(scheduler.getFailures()[0].error.message).toBe('temporary');
    expect(scheduler.getFailures()[0].timestamp).not.toBe(
      scheduler.getFailures()[0].timestamp,
    );
    scheduler.stop();
    scheduler.stop();
    await jest.advanceTimersByTimeAsync(100);
    expect(calls).toBe(2);
    jest.useRealTimers();
  });

  it('runs one-time tasks and tasks registered after startup', async () => {
    jest.useFakeTimers();
    const now = new Date('2026-01-01T00:00:00Z');
    const scheduler = new SchedulerService(
      new InMemorySchedulerLock(
        () => now.getTime(),
        () => 'token',
      ),
      () => new Date(now),
    );
    let onceCalls = 0;
    scheduler.register({
      id: 'past-once',
      type: 'once',
      runAt: new Date(now.getTime() - 1),
      handler: async (): Promise<void> => {
        onceCalls += 1;
      },
    });
    scheduler.register({
      id: 'disabled',
      type: 'once',
      runAt: now,
      enabled: false,
      handler: async (): Promise<void> => {
        throw new Error('must not run');
      },
    });
    scheduler.start();
    scheduler.register({
      id: 'future-once',
      type: 'once',
      runAt: new Date(now.getTime() + 5),
      lockTtlMs: 50,
      handler: async (): Promise<void> => {
        onceCalls += 1;
      },
    });
    await jest.advanceTimersByTimeAsync(5);
    expect(onceCalls).toBe(2);
    scheduler.stop();
    scheduler.start();
    await jest.advanceTimersByTimeAsync(100);
    expect(onceCalls).toBe(2);
    scheduler.stop();
    jest.useRealTimers();
  });

  it('schedules cron tasks from the injected clock', async () => {
    jest.useFakeTimers();
    let now = new Date('2026-01-01T10:14:00Z');
    let calls = 0;
    const scheduler = new SchedulerService(
      new InMemorySchedulerLock(
        () => now.getTime(),
        () => 'cron-token',
      ),
      () => new Date(now),
    );
    scheduler.register({
      id: 'cron',
      type: 'cron',
      cron: '*/15 * * * *',
      handler: async (): Promise<void> => {
        calls += 1;
      },
    });
    scheduler.start();
    now = new Date('2026-01-01T10:15:00Z');
    await jest.advanceTimersByTimeAsync(60_000);
    expect(calls).toBe(1);
    scheduler.stop();
    jest.useRealTimers();
  });

  it('handles lock contention and releases locks after handler errors', async () => {
    jest.useFakeTimers();
    let available = false;
    let releases = 0;
    const lock: SchedulerLock = {
      acquire: async (): Promise<string | undefined> =>
        available ? 'token' : undefined,
      release: async (): Promise<boolean> => {
        releases += 1;
        return true;
      },
    };
    const scheduler = new SchedulerService(lock);
    scheduler.register({
      id: 'contended',
      type: 'interval',
      intervalMs: 1,
      handler: async (): Promise<void> => {
        throw new Error('handler failure');
      },
    });
    scheduler.start();
    await jest.advanceTimersByTimeAsync(1);
    expect(scheduler.getMetrics().skipped).toBe(1);
    available = true;
    await jest.advanceTimersByTimeAsync(1);
    expect(scheduler.getMetrics().failed).toBe(1);
    expect(releases).toBe(1);
    scheduler.stop();
    jest.useRealTimers();
  });

  it('does not reschedule a task stopped while its handler runs', async () => {
    jest.useFakeTimers();
    let release: (() => void) | undefined;
    const handlerGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const scheduler = new SchedulerService();
    scheduler.register({
      id: 'stop-during-run',
      type: 'interval',
      intervalMs: 1,
      handler: async (): Promise<void> => handlerGate,
    });
    scheduler.start();
    await jest.advanceTimersByTimeAsync(1);
    scheduler.stop();
    release?.();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(10);
    expect(scheduler.getMetrics().executed).toBe(1);
    jest.useRealTimers();
  });

  it('validates registrations and duplicate task identifiers', () => {
    const scheduler = new SchedulerService();
    const handler = async (): Promise<void> => undefined;
    expect(() =>
      scheduler.register({ id: ' ', type: 'interval', intervalMs: 1, handler }),
    ).toThrow(TypeError);
    expect(() =>
      scheduler.register({
        id: 'ttl',
        type: 'interval',
        intervalMs: 1,
        lockTtlMs: 0,
        handler,
      }),
    ).toThrow(RangeError);
    expect(() =>
      scheduler.register({
        id: 'ttl-nan',
        type: 'interval',
        intervalMs: 1,
        lockTtlMs: Number.NaN,
        handler,
      }),
    ).toThrow(RangeError);
    expect(() =>
      scheduler.register({ id: 'interval', type: 'interval', handler }),
    ).toThrow(RangeError);
    expect(() =>
      scheduler.register({
        id: 'interval-zero',
        type: 'interval',
        intervalMs: 0,
        handler,
      }),
    ).toThrow(RangeError);
    expect(() =>
      scheduler.register({
        id: 'interval-nan',
        type: 'interval',
        intervalMs: Number.NaN,
        handler,
      }),
    ).toThrow(RangeError);
    expect(() =>
      scheduler.register({ id: 'once', type: 'once', handler }),
    ).toThrow(RangeError);
    expect(() =>
      scheduler.register({
        id: 'once-invalid',
        type: 'once',
        runAt: new Date(Number.NaN),
        handler,
      }),
    ).toThrow(RangeError);
    expect(() =>
      scheduler.register({ id: 'cron', type: 'cron', handler }),
    ).toThrow(SyntaxError);
    expect(() =>
      scheduler.register({
        id: 'cron-invalid',
        type: 'cron',
        cron: 'bad',
        handler,
      }),
    ).toThrow(SyntaxError);
    scheduler.register({
      id: 'duplicate',
      type: 'interval',
      intervalMs: 1,
      handler,
    });
    expect(() =>
      scheduler.register({
        id: 'duplicate',
        type: 'interval',
        intervalMs: 1,
        handler,
      }),
    ).toThrow('already registered');
  });

  it('clears active timers when stopped', () => {
    const handles: Array<ReturnType<typeof setTimeout>> = [];
    const cleared: Array<ReturnType<typeof setTimeout>> = [];
    const timer: SchedulerTimer = {
      setTimeout: (_callback): ReturnType<typeof setTimeout> => {
        const handle = (handles.length + 1) as unknown as ReturnType<
          typeof setTimeout
        >;
        handles.push(handle);
        return handle;
      },
      clearTimeout: (handle): void => {
        cleared.push(handle);
      },
    };
    const scheduler = new SchedulerService(
      new InMemorySchedulerLock(),
      () => new Date('2026-01-01T00:00:00Z'),
      timer,
    );
    scheduler.register({
      id: 'timer',
      type: 'interval',
      intervalMs: 10,
      handler: async (): Promise<void> => undefined,
    });
    scheduler.start();
    scheduler.stop();
    expect(cleared).toEqual(handles);
  });

  it('wires default and custom scheduler modules and barrel exports', async () => {
    expect(schedulingExports.SchedulerModule).toBe(SchedulerModule);
    expect(typeof schedulingExports.SCHEDULER_LOCK).toBe('symbol');
    const defaults = await Test.createTestingModule({
      imports: [SchedulerModule.register()],
    }).compile();
    expect(defaults.get(SCHEDULER_LOCK)).toBeInstanceOf(InMemorySchedulerLock);
    expect(defaults.get(SchedulerService)).toBeInstanceOf(SchedulerService);
    await defaults.close();

    const lock = new InMemorySchedulerLock();
    const timer: SchedulerTimer = {
      setTimeout: (): ReturnType<typeof setTimeout> =>
        1 as unknown as ReturnType<typeof setTimeout>,
      clearTimeout: (): void => undefined,
    };
    const custom = await Test.createTestingModule({
      imports: [
        SchedulerModule.register({
          lock,
          clock: () => new Date('2026-01-01'),
          timer,
        }),
      ],
    }).compile();
    expect(custom.get(SCHEDULER_LOCK)).toBe(lock);
    await custom.close();
  });

  it('renews distributed locks for long jobs and bounds failures', async () => {
    jest.useFakeTimers();
    const renewals: number[] = [];
    const lock: SchedulerLock = {
      acquire: async () => 'token',
      release: async () => true,
      renew: async () => {
        renewals.push(Date.now());
        return true;
      },
    };
    const timer: SchedulerTimer = {
      setTimeout: (callback, ms): ReturnType<typeof setTimeout> =>
        setTimeout(callback, ms),
      clearTimeout: (handle): void => {
        clearTimeout(handle);
      },
    };
    const scheduler = new SchedulerService(
      lock,
      () => new Date('2026-01-01T00:00:00Z'),
      timer,
      { maxFailures: 1 },
    );
    let releaseHandler: (() => void) | undefined;
    scheduler.register({
      id: 'long',
      type: 'once',
      runAt: new Date('2026-01-01T00:00:00Z'),
      lockTtlMs: 100,
      lockRenewIntervalMs: 20,
      handler: async (): Promise<void> =>
        new Promise<void>((resolve) => {
          releaseHandler = resolve;
        }),
    });
    scheduler.start();
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(60);
    expect(renewals.length).toBeGreaterThan(0);
    releaseHandler?.();
    await jest.advanceTimersByTimeAsync(0);
    scheduler.stop();
    expect(() => SchedulerModule.register({ isProduction: true })).toThrow(
      /distributed lock/,
    );
    expect(() =>
      SchedulerModule.register({ isProduction: true, allowInMemory: true }),
    ).not.toThrow();
    expect(() =>
      SchedulerModule.register({
        isProduction: true,
        lock: new InMemorySchedulerLock(),
      }),
    ).toThrow(/InMemorySchedulerLock is not safe/);
    const renewLock = new InMemorySchedulerLock();
    const token = await renewLock.acquire('k', 100);
    expect(token).toBeDefined();
    expect(await renewLock.renew('k', token as string, 100)).toBe(true);
    expect(await renewLock.renew('missing', 'x', 100)).toBe(false);

    const failing = new SchedulerService(
      new InMemorySchedulerLock(),
      () => new Date('2026-01-01T00:00:00Z'),
      undefined,
      { maxFailures: 1 },
    );
    failing.register({
      id: 'fail-a',
      type: 'once',
      runAt: new Date('2026-01-01T00:00:00Z'),
      handler: async (): Promise<void> => {
        throw new Error('a');
      },
    });
    failing.register({
      id: 'fail-b',
      type: 'once',
      runAt: new Date('2026-01-01T00:00:00Z'),
      handler: async (): Promise<void> => {
        throw new Error('b');
      },
    });
    failing.start();
    await jest.advanceTimersByTimeAsync(0);
    failing.stop();
    expect(failing.getFailures()).toHaveLength(1);
    expect(failing.getFailures()[0].error.message).toBe('b');
    expect(() =>
      failing.register({
        id: 'bad-renew',
        type: 'once',
        runAt: new Date('2026-01-01T00:00:00Z'),
        lockRenewIntervalMs: 0,
        handler: async (): Promise<void> => undefined,
      }),
    ).toThrow(/renew interval/);

    let releaseFalseRenew: (() => void) | undefined;
    const falseRenewLock: SchedulerLock = {
      acquire: async () => 'token',
      release: async () => true,
      renew: async () => false,
    };
    const falseRenewScheduler = new SchedulerService(
      falseRenewLock,
      () => new Date('2026-01-01T00:00:00Z'),
      timer,
    );
    falseRenewScheduler.register({
      id: 'false-renew',
      type: 'once',
      runAt: new Date('2026-01-01T00:00:00Z'),
      lockTtlMs: 100,
      lockRenewIntervalMs: 20,
      handler: async (): Promise<void> =>
        new Promise<void>((resolve) => {
          releaseFalseRenew = resolve;
        }),
    });
    falseRenewScheduler.start();
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(60);
    releaseFalseRenew?.();
    await jest.advanceTimersByTimeAsync(0);
    falseRenewScheduler.stop();
    jest.useRealTimers();
  });
});
