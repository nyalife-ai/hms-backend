import type { DynamicModule, Provider } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { REDIS_CLIENT } from '../../../platform/architecture/tokens/injection.tokens';
import {
  CacheModule,
  DistributedLockService,
  RedisCacheStore,
} from '../../../platform/cache';
import {
  CACHE_STORE,
  DISTRIBUTED_LOCK,
  REDIS_CLIENT as CACHE_REDIS_CLIENT,
} from '../../../platform/cache/contracts/cache.tokens';
import { RedisClientService } from '../redis-client.service';
import {
  maskRedisUrl,
  RedisConnectionFactory,
} from '../redis-connection.factory';
import { RedisHealthIndicator } from '../redis.health.indicator';
import { RedisInfrastructureModule } from '../redis.module';
import type { RedisDriver, RedisTimer } from '../redis.types';

function driver(overrides: Partial<RedisDriver> = {}): RedisDriver {
  return {
    connect: jest.fn(async () => undefined),
    quit: jest.fn(async () => 'OK' as const),
    disconnect: jest.fn(),
    ping: jest.fn(async () => 'PONG'),
    on: jest.fn(function (this: RedisDriver) {
      return this;
    }),
    pipeline: jest.fn(() => ({ exec: async () => [] })),
    get: jest.fn(async () => 'value'),
    set: jest.fn(async () => 'OK' as const),
    setex: jest.fn(async () => 'OK' as const),
    del: jest.fn(async () => 1),
    exists: jest.fn(async () => 1),
    eval: jest.fn(async () => 'result'),
    scan: jest.fn(async () => ['0', ['key']]),
    xadd: jest.fn(async () => '1-0'),
    xgroup: jest.fn(async () => 'OK'),
    xreadgroup: jest.fn(async () => null),
    xack: jest.fn(async () => 1),
    ...overrides,
  };
}

describe('Redis infrastructure', () => {
  it('connects idempotently, delegates commands, and shuts down', async () => {
    const redis = driver();
    const client = new RedisClientService(redis);
    await Promise.all([client.connect(), client.connect()]);
    await client.connect();
    expect(redis.connect).toHaveBeenCalledTimes(1);
    await expect(client.get('key')).resolves.toBe('value');
    await expect(client.set('key', 'value')).resolves.toBe('OK');
    await expect(client.set('key', 'value', 'PX', 10, 'NX')).resolves.toBe(
      'OK',
    );
    await expect(client.setex('key', 1, 'value')).resolves.toBe('OK');
    await expect(client.del('a', 'b')).resolves.toBe(1);
    await expect(client.exists('key')).resolves.toBe(1);
    await expect(client.eval('return 1', 0)).resolves.toBe('result');
    await expect(client.scan('0', 'MATCH', '*', 'COUNT', 10)).resolves.toEqual([
      '0',
      ['key'],
    ]);
    await client.onModuleDestroy();
    await client.disconnect();
    expect(redis.quit).toHaveBeenCalledTimes(1);
  });

  it('retries deterministically and exposes retry strategy', async () => {
    const redis = driver({
      connect: jest
        .fn<() => Promise<void>>()
        .mockRejectedValueOnce(new Error('down'))
        .mockResolvedValue(undefined),
    });
    const sleeper = jest.fn(async () => undefined);
    const client = new RedisClientService(
      redis,
      {
        maxReconnectAttempts: 2,
        reconnectBaseDelayMs: 100,
        reconnectMaxDelayMs: 100,
      },
      sleeper,
      undefined,
      Date.now,
      () => 0,
    );
    await client.onModuleInit();
    expect(sleeper).toHaveBeenCalledWith(50);
    expect(client.retryStrategy()(1)).toBe(50);
    expect(client.retryStrategy()(3)).toBeNull();
    await expect(
      new RedisClientService(
        driver({
          connect: jest.fn(async () => Promise.reject(new Error('down'))),
        }),
        { maxReconnectAttempts: 1 },
      ).connect(),
    ).rejects.toThrow('down');

    jest.useFakeTimers();
    const defaultSleepDriver = driver({
      connect: jest
        .fn<() => Promise<void>>()
        .mockRejectedValueOnce(new Error('once'))
        .mockResolvedValue(undefined),
    });
    const defaultSleepClient = new RedisClientService(defaultSleepDriver, {
      reconnectBaseDelayMs: 0,
    });
    const connecting = defaultSleepClient.connect();
    await jest.runAllTimersAsync();
    await connecting;
    jest.useRealTimers();

    const defaults = new RedisClientService(
      driver(),
      {},
      undefined,
      undefined,
      undefined,
      () => 1,
    );
    expect(defaults.retryStrategy()(1)).toBe(100);
  });

  it('falls back to disconnect and handles never-connected shutdown', async () => {
    const redis = driver({
      quit: jest.fn(async () => Promise.reject(new Error('quit'))),
    });
    const client = new RedisClientService(redis);
    await client.disconnect();
    await client.connect();
    await client.disconnect();
    expect(redis.disconnect).toHaveBeenCalledTimes(1);
  });

  it('handles command success, failure, timeout, and health masking', async () => {
    let callback: (() => void) | undefined;
    const timer: RedisTimer = {
      set: jest.fn((next) => {
        callback = next;
        return 1;
      }),
      clear: jest.fn(),
    };
    const redis = driver();
    const client = new RedisClientService(
      redis,
      { commandTimeoutMs: 10 },
      undefined,
      timer,
      jest.fn().mockReturnValueOnce(10).mockReturnValue(15),
    );
    await expect(client.withTimeout(Promise.resolve('ok'))).resolves.toBe('ok');
    await expect(
      client.withTimeout(Promise.reject(new Error('bad'))),
    ).rejects.toThrow('bad');
    await expect(
      client.withTimeout(Promise.reject('primitive-failure')),
    ).rejects.toThrow('primitive-failure');
    const pending = client.withTimeout(new Promise(() => undefined));
    callback?.();
    await expect(pending).rejects.toThrow('timed out');
    await expect(client.healthCheck()).resolves.toEqual({
      status: 'up',
      latencyMs: 5,
    });

    const down = new RedisClientService(
      driver({
        ping: jest.fn(async () =>
          Promise.reject(new Error('redis://u:secret@host')),
        ),
      }),
      {},
      undefined,
      undefined,
      jest.fn().mockReturnValueOnce(1).mockReturnValue(3),
    );
    await expect(down.healthCheck()).resolves.toEqual({
      status: 'down',
      latencyMs: 2,
      error: 'redis://u:***@host',
    });
    expect(RedisClientService.maskError('plain')).toBe('plain');
  });

  it('builds shared connections lazily without leaking passwords', () => {
    const constructed: Readonly<Record<string, unknown>>[] = [];
    class FakeRedis {
      public constructor(options: Readonly<Record<string, unknown>>) {
        constructed.push(options);
      }
    }
    const factory = new RedisConnectionFactory(() => ({ default: FakeRedis }));
    const pair = factory.create({
      host: 'host',
      port: 6380,
      db: 2,
      password: 'secret',
      tls: true,
      maxReconnectAttempts: 1,
      reconnectBaseDelayMs: 2,
      reconnectMaxDelayMs: 3,
    });
    expect(factory.create()).toBe(pair);
    expect(constructed).toHaveLength(2);
    expect(pair.safeDescription).toBe('rediss://host:6380/2');
    expect(maskRedisUrl('redis://user:secret@host')).toBe(
      'redis://user:***@host',
    );
    const retry = constructed[0].retryStrategy as (
      attempt: number,
    ) => number | null;
    expect(retry(1)).toBe(2);
    expect(retry(2)).toBeNull();

    const directOptions: Readonly<Record<string, unknown>>[] = [];
    const Direct = class FakeDirect {
      public constructor(options: Readonly<Record<string, unknown>>) {
        directOptions.push(options);
      }
    };
    const direct = new RedisConnectionFactory(() => Direct).create();
    expect(direct.safeDescription).toBe('redis://127.0.0.1:6379/0');
    const defaultRetry = directOptions[0].retryStrategy as (
      attempt: number,
    ) => number | null;
    expect(defaultRetry(1)).toBe(100);
    expect(defaultRetry(4)).toBeNull();
  });

  it('prefers REDIS_URL over discrete host/port options', () => {
    const constructed: Readonly<Record<string, unknown>>[] = [];
    class FakeRedis {
      public constructor(options: Readonly<Record<string, unknown>>) {
        constructed.push(options);
      }
    }
    const fromUrl = new RedisConnectionFactory(() => ({
      default: FakeRedis,
    })).create({
      url: 'rediss://:p%40ss@redis.example:6381/3',
      host: 'ignored',
      port: 1,
      password: 'fallback',
    });
    expect(fromUrl.safeDescription).toBe('rediss://redis.example:6381/3');
    expect(constructed[0]).toEqual(
      expect.objectContaining({
        host: 'redis.example',
        port: 6381,
        db: 3,
        password: 'p@ss',
        tls: {},
      }),
    );

    const plainUrlOptions: Readonly<Record<string, unknown>>[] = [];
    class PlainRedis {
      public constructor(options: Readonly<Record<string, unknown>>) {
        plainUrlOptions.push(options);
      }
    }
    const plain = new RedisConnectionFactory(() => PlainRedis).create({
      url: 'redis://localhost',
    });
    expect(plain.safeDescription).toBe('redis://localhost:6379/0');
    expect(plainUrlOptions[0]).toEqual(
      expect.objectContaining({
        host: 'localhost',
        port: 6379,
        db: 0,
      }),
    );
    expect(plainUrlOptions[0]).not.toHaveProperty('password');

    const overrideOptions: Readonly<Record<string, unknown>>[] = [];
    class OverrideRedis {
      public constructor(options: Readonly<Record<string, unknown>>) {
        overrideOptions.push(options);
      }
    }
    const overridden = new RedisConnectionFactory(() => OverrideRedis).create({
      url: 'redis://:empty-pass-ignored@host/not-a-db',
      db: 9,
      tls: true,
    });
    expect(overridden.safeDescription).toBe('rediss://host:6379/9');
    expect(overrideOptions[0]).toEqual(
      expect.objectContaining({
        host: 'host',
        port: 6379,
        db: 9,
        password: 'empty-pass-ignored',
        tls: {},
      }),
    );

    const fallbackPassword: Readonly<Record<string, unknown>>[] = [];
    class FallbackRedis {
      public constructor(options: Readonly<Record<string, unknown>>) {
        fallbackPassword.push(options);
      }
    }
    new RedisConnectionFactory(() => FallbackRedis).create({
      url: 'redis://127.0.0.1:6379/0',
      password: 'from-options',
    });
    expect(fallbackPassword[0]).toEqual(
      expect.objectContaining({ password: 'from-options' }),
    );

    const emptyHost: Readonly<Record<string, unknown>>[] = [];
    class EmptyHostRedis {
      public constructor(options: Readonly<Record<string, unknown>>) {
        emptyHost.push(options);
      }
    }
    const emptyHostPair = new RedisConnectionFactory(
      () => EmptyHostRedis,
    ).create({
      url: 'redis:///',
    });
    expect(emptyHostPair.safeDescription).toBe('redis://127.0.0.1:6379/0');
    expect(emptyHost[0]).toEqual(
      expect.objectContaining({ host: '127.0.0.1', port: 6379 }),
    );

    const emptyUrl: Readonly<Record<string, unknown>>[] = [];
    class EmptyUrlRedis {
      public constructor(options: Readonly<Record<string, unknown>>) {
        emptyUrl.push(options);
      }
    }
    new RedisConnectionFactory(() => EmptyUrlRedis).create({
      url: '',
      host: 'fallback-host',
      port: 6390,
    });
    expect(emptyUrl[0]).toEqual(
      expect.objectContaining({ host: 'fallback-host', port: 6390 }),
    );
  });

  it('reports health and exposes module providers', async () => {
    const client = new RedisClientService(
      driver(),
      {},
      undefined,
      undefined,
      () => 5,
    );
    const indicator = new RedisHealthIndicator(client, 10);
    await expect(indicator.check()).resolves.toEqual({
      name: 'redis',
      status: 'up',
      durationMs: 0,
    });
    const downClient = {
      healthCheck: async () => ({
        status: 'down' as const,
        latencyMs: 1,
        error: 'down',
      }),
      withTimeout: <T>(value: Promise<T>): Promise<T> => value,
    } as RedisClientService;
    await expect(new RedisHealthIndicator(downClient).check()).resolves.toEqual(
      {
        name: 'redis',
        status: 'down',
        durationMs: 1,
        message: 'down',
      },
    );

    const redis = driver();
    const module: DynamicModule = RedisInfrastructureModule.register({
      driver: redis,
    });
    const providers = module.providers as Provider[];
    const serviceProvider = providers.find(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        'provide' in item &&
        item.provide === RedisClientService,
    ) as { useFactory: () => RedisClientService };
    expect(serviceProvider.useFactory().driver).toBe(redis);
    expect(module.exports).toContain(REDIS_CLIENT);

    const factory = {
      create: jest.fn(() => ({ client: redis })),
    } as unknown as RedisConnectionFactory;
    const factoryModule = RedisInfrastructureModule.register({ factory });
    const factoryProvider = (factoryModule.providers as Provider[])[0] as {
      useFactory: () => RedisClientService;
    };
    expect(factoryProvider.useFactory().driver).toBe(redis);

    const defaultModule = RedisInfrastructureModule.register();
    const defaultProvider = (defaultModule.providers as Provider[])[0] as {
      useFactory: () => RedisClientService;
    };
    expect(defaultProvider.useFactory()).toBeInstanceOf(RedisClientService);
  });

  it('shares the canonical Redis client with CacheModule', async () => {
    const redis = driver();
    const module = await Test.createTestingModule({
      imports: [
        CacheModule.registerAsync<[RedisClientService]>({
          imports: [RedisInfrastructureModule.register({ driver: redis })],
          inject: [REDIS_CLIENT],
          useFactory: (redisClient) => ({ redisClient }),
        }),
      ],
    }).compile();

    expect(CACHE_REDIS_CLIENT).toBe(REDIS_CLIENT);
    expect(module.get(CACHE_STORE)).toBeInstanceOf(RedisCacheStore);
    expect(module.get(DISTRIBUTED_LOCK)).toBeInstanceOf(DistributedLockService);
    await module.close();
  });
});
