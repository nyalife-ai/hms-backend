import { MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import compression from 'compression';
import { NextFunction, Request, Response } from 'express';
import {
  CompressionMiddleware,
  compressResponse,
  selectCompressionAlgorithm,
} from '../compression.middleware';
import { compress, decompress } from '../compression.util';
import { PoolMetrics } from '../connection-pool.hooks';
import { lazy, LazyValue } from '../lazy';
import { PerformanceModule } from '../performance.module';
import * as performanceExports from '../index';

jest.mock('compression', () => {
  const actual =
    jest.requireActual<typeof import('compression')>('compression');
  const factory = jest.fn((_options?: compression.CompressionOptions) => {
    const handler = jest.fn(
      (_request: Request, _response: Response, next: NextFunction) => {
        next();
      },
    );
    return handler;
  });
  return Object.assign(factory, { filter: actual.filter });
});

const compressionFactory = compression as unknown as jest.MockedFunction<
  typeof compression
> & { filter: typeof compression.filter };

describe('performance platform', () => {
  beforeEach(() => {
    compressionFactory.mockClear();
  });

  it.each(['gzip', 'br'] as const)(
    'round-trips %s compressed data',
    async (algorithm) => {
      const input = Buffer.from('compressible '.repeat(100));
      const compressed = await compress(input, algorithm);
      expect(compressed.length).toBeLessThan(input.length);
      expect(await decompress(compressed, algorithm)).toEqual(input);
    },
  );

  it('negotiates accepted encodings and response thresholds', async () => {
    expect(selectCompressionAlgorithm(undefined)).toBeUndefined();
    expect(selectCompressionAlgorithm('deflate')).toBeUndefined();
    expect(selectCompressionAlgorithm('gzip;q=0.5, br;q=0')).toBe('gzip');
    expect(selectCompressionAlgorithm('gzip;q=invalid')).toBeUndefined();
    expect(selectCompressionAlgorithm('*;q=1', ['gzip'])).toBe('gzip');
    expect(selectCompressionAlgorithm('br, gzip')).toBe('br');

    const small = await compressResponse('small', 'gzip', {
      thresholdBytes: 100,
    });
    expect(small.algorithm).toBeUndefined();
    expect(small.body.toString()).toBe('small');
    const defaults = await compressResponse('small', 'gzip');
    expect(defaults.algorithm).toBeUndefined();
    const unsupported = await compressResponse('large payload', undefined, {
      thresholdBytes: 0,
    });
    expect(unsupported.algorithm).toBeUndefined();
    const result = await compressResponse(
      Buffer.from('payload'.repeat(100)),
      'br',
      {
        thresholdBytes: 0,
      },
    );
    expect(result.algorithm).toBe('br');
    expect((await decompress(result.body, 'br')).toString()).toBe(
      'payload'.repeat(100),
    );
  });

  it('memoizes lazy values, including undefined, but retries failures', () => {
    const factory = jest.fn(() => ({ ready: true }));
    const getter = lazy(factory);
    expect(getter()).toBe(getter());
    expect(factory).toHaveBeenCalledTimes(1);

    const undefinedFactory = jest.fn(() => undefined);
    const value = new LazyValue(undefinedFactory);
    expect(value.isInitialized).toBe(false);
    expect(value.value).toBeUndefined();
    expect(value.value).toBeUndefined();
    expect(value.isInitialized).toBe(true);
    expect(undefinedFactory).toHaveBeenCalledTimes(1);

    let attempt = 0;
    const failing = new LazyValue(() => {
      attempt += 1;
      if (attempt === 1) {
        throw new Error('temporary');
      }
      return 'ready';
    });
    expect(() => failing.value).toThrow('temporary');
    expect(failing.value).toBe('ready');
  });

  it('collects pool wait, hold, failure, and concurrency metrics', () => {
    let now = 100;
    const hooks = {
      onAcquireStart: jest.fn(),
      onAcquire: jest.fn(),
      onAcquireError: jest.fn(),
      onRelease: jest.fn(),
    };
    const metrics = new PoolMetrics(hooks, () => now);
    const first = metrics.acquireStarted();
    now = 115;
    const lease = metrics.acquired(first);
    const failed = metrics.acquireStarted();
    now = 125;
    metrics.acquireFailed(failed);
    now = 150;
    metrics.released(lease);
    metrics.released(lease);
    expect(metrics.snapshot()).toEqual({
      active: 0,
      pending: 0,
      acquired: 1,
      released: 2,
      acquireErrors: 1,
      totalWaitMilliseconds: 25,
      maximumWaitMilliseconds: 15,
      totalHeldMilliseconds: 70,
    });
    expect(hooks.onAcquireStart).toHaveBeenCalledTimes(2);
    expect(hooks.onAcquire).toHaveBeenCalledWith(15);
    expect(hooks.onAcquireError).toHaveBeenCalledWith(10);
    expect(hooks.onRelease).toHaveBeenLastCalledWith(35);
    metrics.reset();
    expect(metrics.snapshot().acquired).toBe(0);

    let reverseTime = 10;
    const clamped = new PoolMetrics({}, () => reverseTime);
    const token = clamped.acquireStarted();
    reverseTime = 0;
    const clampedLease = clamped.acquired(token);
    clamped.acquireFailed(token);
    clamped.released(clampedLease);
    expect(clamped.snapshot().totalWaitMilliseconds).toBe(0);

    const defaults = new PoolMetrics();
    const defaultStart = defaults.acquireStarted();
    defaults.released(defaults.acquired(defaultStart));
    expect(defaults.snapshot().released).toBe(1);
  });

  it('creates one reusable streaming handler and delegates use to it', () => {
    const middleware = new CompressionMiddleware({ thresholdBytes: 512 });
    expect(compressionFactory).toHaveBeenCalledTimes(1);
    expect(compressionFactory).toHaveBeenCalledWith({
      threshold: 512,
    });
    const handler = compressionFactory.mock.results[0]?.value as jest.Mock;
    expect(typeof handler).toBe('function');

    const request = { headers: {} } as Request;
    const response = {} as Response;
    const next = jest.fn() as NextFunction;
    middleware.use(request, response, next);
    middleware.use(request, response, next);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(1, request, response, next);
    expect(handler).toHaveBeenNthCalledWith(2, request, response, next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('maps default threshold and preferred-algorithm filter onto compression', () => {
    new CompressionMiddleware();
    expect(compressionFactory).toHaveBeenCalledWith({
      threshold: 1_024,
    });

    compressionFactory.mockClear();
    new CompressionMiddleware({ preferredAlgorithms: ['gzip'] });
    const options = compressionFactory.mock.calls[0]?.[0] as {
      threshold: number;
      filter: (request: Request, response: Response) => boolean;
    };
    expect(options.threshold).toBe(1_024);
    expect(typeof options.filter).toBe('function');

    const compressible = {
      getHeader: (name: string) =>
        name.toLowerCase() === 'content-type' ? 'text/plain' : undefined,
    } as unknown as Response;
    const incompressible = {
      getHeader: () => undefined,
    } as unknown as Response;

    expect(
      options.filter(
        { headers: { 'accept-encoding': 'gzip' } } as Request,
        compressible,
      ),
    ).toBe(true);
    expect(
      options.filter(
        { headers: { 'accept-encoding': ['gzip', 'identity'] } } as Request,
        compressible,
      ),
    ).toBe(true);
    expect(
      options.filter(
        { headers: { 'accept-encoding': 'br' } } as Request,
        compressible,
      ),
    ).toBe(false);
    expect(options.filter({ headers: {} } as Request, compressible)).toBe(
      false,
    );
    expect(
      options.filter(
        { headers: { 'accept-encoding': 'gzip' } } as Request,
        incompressible,
      ),
    ).toBe(false);
  });

  it('registers and conditionally configures the performance module', () => {
    expect(performanceExports.lazy).toBe(lazy);
    expect(PerformanceModule.register().providers).toBeDefined();
    expect(
      PerformanceModule.register({ compression: { thresholdBytes: 0 } })
        .exports,
    ).toBeDefined();
    const forRoutes = jest.fn();
    const apply = jest.fn(() => ({ forRoutes }));
    const consumer = { apply } as unknown as MiddlewareConsumer;
    new PerformanceModule().configure(consumer);
    expect(apply).toHaveBeenCalled();
    expect(forRoutes).toHaveBeenCalledWith({
      path: '*',
      method: RequestMethod.ALL,
    });
    apply.mockClear();
    new PerformanceModule({ enableCompressionMiddleware: false }).configure(
      consumer,
    );
    expect(apply).not.toHaveBeenCalled();
  });
});
