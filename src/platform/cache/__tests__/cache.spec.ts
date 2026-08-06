import 'reflect-metadata';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { firstValueFrom, of } from 'rxjs';
import {
  CACHE_EVICT_METADATA,
  CacheEvict,
} from '../decorators/cache-evict.decorator';
import {
  CACHEABLE_METADATA,
  Cacheable,
  CacheableOptions,
} from '../decorators/cacheable.decorator';
import { CacheableInterceptor } from '../decorators/cacheable.interceptor';
import { CacheInvalidationService } from '../invalidation/cache-invalidation.service';
import {
  DistributedLockService,
  InMemoryDistributedLock,
} from '../locks/distributed-lock.service';
import { InMemoryCacheStore } from '../redis/in-memory-cache.store';
import { RedisCacheStore } from '../redis/redis-cache.store';
import { RedisClientLike, RedisSetResult } from '../redis/redis.types';
import { CacheKeyBuilder } from '../strategies/cache-key.builder';
import { TagIndex } from '../strategies/tag-index';
import { TtlStrategy } from '../strategies/ttl.strategy';
import { CacheModule } from '../cache.module';
import { CACHE_STORE, DISTRIBUTED_LOCK } from '../contracts/cache.tokens';
import * as cacheExports from '../index';
import { TenantContext } from '../../tenancy/tenant-context';
import type { TenantConfiguration } from '../../tenancy/tenancy.types';

const cacheTenant = (id: string): TenantConfiguration => ({
  id,
  name: id,
  isolation: 'shared-database',
  settings: {},
  metadata: {},
});

class FakeRedis implements RedisClientLike {
  public readonly values = new Map<string, string>();
  public readonly expirations = new Map<string, number>();
  public scanCalls = 0;

  public async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  public async set(
    key: string,
    value: string,
    expiryMode?: 'PX',
    ttlMilliseconds?: number,
    condition?: 'NX',
  ): Promise<RedisSetResult> {
    if (condition === 'NX' && this.values.has(key)) {
      return null;
    }
    this.values.set(key, value);
    if (expiryMode === 'PX' && ttlMilliseconds !== undefined) {
      this.expirations.set(key, ttlMilliseconds);
    }
    return 'OK';
  }

  public async setex(
    key: string,
    ttlSeconds: number,
    value: string,
  ): Promise<'OK'> {
    this.values.set(key, value);
    this.expirations.set(key, ttlSeconds * 1_000);
    return 'OK';
  }

  public async del(...keys: string[]): Promise<number> {
    return keys.reduce(
      (count, key) => count + (this.values.delete(key) ? 1 : 0),
      0,
    );
  }

  public async exists(key: string): Promise<number> {
    return this.values.has(key) ? 1 : 0;
  }

  public async eval(
    _script: string,
    _numberOfKeys: number,
    key: string,
    token: string,
  ): Promise<unknown> {
    if (this.values.get(key) !== token) {
      return 0;
    }
    this.values.delete(key);
    return 1;
  }

  public async scan(
    _cursor: string,
    _matchToken: 'MATCH',
    pattern: string,
    _countToken: 'COUNT',
    _count: number,
  ): Promise<[string, string[]]> {
    this.scanCalls += 1;
    const prefix = pattern.slice(0, -1);
    return [
      '0',
      [...this.values.keys()].filter((key) => key.startsWith(prefix)),
    ];
  }
}

describe('cache platform', () => {
  it('stores, expires, deletes, and clears in-memory values', async () => {
    let now = 1_000;
    const store = new InMemoryCacheStore(() => now);
    await store.set('key', { ok: true }, { ttlSeconds: 2 });
    expect(await store.get('missing')).toBeUndefined();
    expect(await store.get<{ ok: boolean }>('key')).toEqual({ ok: true });
    expect(await store.has('key')).toBe(true);
    now = 3_000;
    expect(await store.get('key')).toBeUndefined();
    await store.set('invalid', 1, { ttlSeconds: 0 });
    expect(await store.has('invalid')).toBe(false);
    await store.set('persistent', 2);
    expect(await store.del('persistent')).toBe(true);
    expect(await store.del('persistent')).toBe(false);
    await store.set('one', 1);
    await store.clear();
    expect(await store.has('one')).toBe(false);
  });

  it('serializes Redis values, applies TTL, and clears only its namespace', async () => {
    const redis = new FakeRedis();
    const store = new RedisCacheStore(redis, 'app:');
    await store.set('one', { value: 1 });
    await store.set(':two', 2, { ttlSeconds: 3 });
    redis.values.set('other:key', '3');
    expect(await store.get('missing')).toBeUndefined();
    expect(await store.get<{ value: number }>('one')).toEqual({ value: 1 });
    expect(await store.has('two')).toBe(true);
    expect(redis.expirations.get('app:two')).toBe(3_000);
    expect(await store.del('one')).toBe(true);
    await store.set('expired', 1, { ttlSeconds: 0 });
    expect(await store.has('expired')).toBe(false);
    await expect(store.set('bad', undefined)).rejects.toThrow(TypeError);
    await store.clear();
    expect(redis.values.has('app:two')).toBe(false);
    expect(redis.values.has('other:key')).toBe(true);
    await store.clear();
    expect(redis.scanCalls).toBe(2);
  });

  it('resolves TTL bounds and deterministic cache keys', () => {
    const strategy = new TtlStrategy({
      defaultTtlSeconds: 10,
      minimumTtlSeconds: 5,
      maximumTtlSeconds: 20,
    });
    expect(strategy.resolve()).toBe(10);
    expect(strategy.resolve(1)).toBe(5);
    expect(strategy.resolve(30)).toBe(20);
    expect(strategy.resolve(Number.NaN)).toBe(0);
    expect(new TtlStrategy().resolve()).toBeUndefined();
    const builder = new CacheKeyBuilder('api:');
    expect(builder.build([{ b: 2, a: 1 }, undefined, null])).toBe(
      builder.build([{ a: 1, b: 2 }, undefined, null]),
    );
    expect(builder.build([[{ z: true }]])).toMatch(/^api:[a-f0-9]{64}$/u);
    expect(builder.build([{ nested: { z: true } }])).toMatch(
      /^api:[a-f0-9]{64}$/u,
    );

    const tenantContext = new TenantContext();
    const tenantBuilder = new CacheKeyBuilder('api', {
      enabled: true,
      context: tenantContext,
    });
    expect(() => tenantBuilder.build(['same'])).toThrow('Tenant context');
    const alphaKey = tenantContext.run(cacheTenant('alpha'), () =>
      tenantBuilder.build(['same']),
    );
    const betaKey = tenantContext.run(cacheTenant('beta'), () =>
      tenantBuilder.build(['same']),
    );
    expect(alphaKey).not.toBe(betaKey);
    expect(
      tenantContext.run(cacheTenant('alpha'), () =>
        tenantBuilder.namespaceExplicitKey('explicit'),
      ),
    ).not.toBe('explicit');
    expect(builder.namespaceExplicitKey('explicit')).toBe('explicit');

    const principalBuilder = new CacheKeyBuilder('api', {
      enabled: true,
      context: tenantContext,
      includePrincipal: true,
    });
    expect(() =>
      tenantContext.run(cacheTenant('alpha'), () =>
        principalBuilder.build(['same']),
      ),
    ).toThrow('Principal context');
    const firstPrincipalKey = tenantContext.run(
      cacheTenant('alpha'),
      () => principalBuilder.build(['same']),
      { id: 'user-1', tenantId: 'alpha' },
    );
    const secondPrincipalKey = tenantContext.run(
      cacheTenant('alpha'),
      () => principalBuilder.build(['same']),
      { id: 'user-2', tenantId: 'alpha' },
    );
    expect(firstPrincipalKey).not.toBe(secondPrincipalKey);
    expect(() =>
      new CacheKeyBuilder('api', { enabled: true }).build(['same']),
    ).toThrow('Tenant context');
  });

  it('indexes tags in memory and an optional backing store', async () => {
    const backing = new InMemoryCacheStore();
    const index = new TagIndex(backing);
    await index.add('one', ['users', 'all']);
    await index.add('two', ['users']);
    expect(await index.keysForTag('users')).toEqual(['one', 'two']);
    const restored = new TagIndex(backing);
    expect(await restored.keysForTag('users')).toEqual(['one', 'two']);
    await index.removeKey('one');
    expect(await index.keysForTag('users')).toEqual(['two']);
    await index.removeKey('two');
    expect(await backing.has('__tags__:users')).toBe(false);
    await index.clearTag('all');
    await index.add('three', ['other']);
    await index.clear();
    expect(await index.keysForTag('other')).toEqual([]);
    const memoryOnly = new TagIndex();
    await memoryOnly.add('key', ['tag']);
    await memoryOnly.clearTag('tag');
    expect(await memoryOnly.keysForTag('tag')).toEqual([]);
  });

  it('invalidates by key, tag, and namespace', async () => {
    const store = new InMemoryCacheStore();
    const tags = new TagIndex();
    const service = new CacheInvalidationService(store, tags);
    await store.set('one', 1);
    await store.set('two', 2);
    await tags.add('one', ['group']);
    await tags.add('two', ['group']);
    expect(await service.invalidateByKey('one')).toBe(true);
    expect(await service.invalidateByTag('group')).toBe(1);
    await store.set('three', 3);
    await tags.add('three', ['all']);
    await service.invalidateNamespace();
    expect(await store.has('three')).toBe(false);
  });

  it('enforces Redis and in-memory lock ownership and expiry', async () => {
    const redis = new FakeRedis();
    const distributed = new DistributedLockService(redis);
    const token = await distributed.acquire('lock', 100);
    expect(token).toBeDefined();
    expect(await distributed.acquire('lock', 100)).toBeUndefined();
    expect(await distributed.release('lock', 'wrong')).toBe(false);
    expect(await distributed.release('lock', token as string)).toBe(true);
    await expect(distributed.acquire('bad', 0)).rejects.toThrow(RangeError);
    expect(
      await distributed.withToken(
        'work',
        100,
        async (heldToken) => heldToken.length,
      ),
    ).toBeGreaterThan(0);
    await distributed.acquire('busy', 100);
    await expect(
      distributed.withToken('busy', 100, async () => true),
    ).rejects.toThrow('already held');

    let now = 0;
    let sequence = 0;
    const memory = new InMemoryDistributedLock(
      () => now,
      () => `token-${++sequence}`,
    );
    const first = await memory.acquire('key', 10);
    expect(await memory.acquire('key', 10)).toBeUndefined();
    expect(await memory.release('key', 'wrong')).toBe(false);
    now = 10;
    const second = await memory.acquire('key', 10);
    expect(second).not.toBe(first);
    expect(await memory.release('missing', 'x')).toBe(false);
    expect(await memory.release('key', second as string)).toBe(true);
    await expect(memory.acquire('bad', -1)).rejects.toThrow(RangeError);
    expect(await memory.withToken('job', 10, () => 42)).toBe(42);
    await memory.acquire('held', 10);
    await expect(memory.withToken('held', 10, () => 1)).rejects.toThrow(
      'already held',
    );
  });

  it('publishes decorator metadata and module providers', () => {
    expect(cacheExports.CacheModule).toBe(CacheModule);
    class Example {
      @Cacheable({ ttl: 5 })
      public query(): void {}

      @CacheEvict({ tags: ['users'] })
      public mutate(): void {}
    }
    class Defaults {
      @Cacheable()
      public query(): void {}

      @CacheEvict()
      public mutate(): void {}
    }
    expect(
      Reflect.getMetadata(CACHEABLE_METADATA, Example.prototype.query),
    ).toEqual({ ttl: 5 });
    expect(
      Reflect.getMetadata(CACHE_EVICT_METADATA, Example.prototype.mutate),
    ).toEqual({ tags: ['users'] });
    expect(
      Reflect.getMetadata(CACHEABLE_METADATA, Defaults.prototype.query),
    ).toEqual({});
    expect(
      Reflect.getMetadata(CACHE_EVICT_METADATA, Defaults.prototype.mutate),
    ).toEqual({});
    const memoryModule = CacheModule.register();
    expect(memoryModule.exports).toContain(CACHE_STORE);
    expect(memoryModule.exports).toContain(DISTRIBUTED_LOCK);
    const redisModule = CacheModule.register({
      redisClient: new FakeRedis(),
      globalInterceptor: true,
    });
    expect(redisModule.providers?.length).toBeGreaterThan(
      memoryModule.providers?.length ?? 0,
    );
  });

  it('constructs cache module providers for memory and Redis', async () => {
    const memoryModule = await Test.createTestingModule({
      imports: [
        CacheModule.register({
          namespace: 'testing',
          defaultTtlSeconds: 7,
        }),
      ],
    }).compile();
    expect(memoryModule.get(CACHE_STORE)).toBeInstanceOf(InMemoryCacheStore);
    expect(memoryModule.get(CacheKeyBuilder).build(['key'])).toMatch(
      /^testing:/u,
    );
    expect(memoryModule.get(TtlStrategy).resolve()).toBe(7);
    await memoryModule.close();

    const redisModule = await Test.createTestingModule({
      imports: [CacheModule.register({ redisClient: new FakeRedis() })],
    }).compile();
    expect(redisModule.get(CACHE_STORE)).toBeInstanceOf(RedisCacheStore);
    expect(redisModule.get(DISTRIBUTED_LOCK)).toBeInstanceOf(
      DistributedLockService,
    );
    await redisModule.close();

    const asyncModule = await Test.createTestingModule({
      imports: [
        CacheModule.registerAsync<[]>({
          useFactory: async () => ({ namespace: 'async' }),
        }),
      ],
    }).compile();
    expect(asyncModule.get(CACHE_STORE)).toBeInstanceOf(InMemoryCacheStore);
    await asyncModule.close();
  });

  it('caches interceptor responses and resolves custom tags and keys', async () => {
    const store = new InMemoryCacheStore();
    const tags = new TagIndex();
    const invalidation = new CacheInvalidationService(store, tags);
    let options: CacheableOptions | undefined = {
      key: (...args: unknown[]) => `key:${String(args[0])}`,
      tags: (...args: unknown[]) => [`tag:${String(args[0])}`],
    };
    const reflector = {
      getAllAndOverride: (metadataKey: string): unknown =>
        metadataKey === CACHEABLE_METADATA ? options : undefined,
    } as unknown as Reflector;
    class Controller {
      public handler(): void {}
    }
    const context = {
      getHandler: () => Controller.prototype.handler,
      getClass: () => Controller,
      getArgs: () => ['one'],
    } as unknown as ExecutionContext;
    const interceptor = new CacheableInterceptor(
      store,
      tags,
      reflector,
      invalidation,
      new CacheKeyBuilder(),
      new TtlStrategy({ defaultTtlSeconds: 5 }),
    );
    const next: CallHandler = { handle: () => of({ result: true }) };
    expect(await firstValueFrom(interceptor.intercept(context, next))).toEqual({
      result: true,
    });
    expect(await tags.keysForTag('tag:one')).toEqual(['key:one']);
    const cachedHandler: CallHandler = {
      handle: () => {
        throw new Error('must not run');
      },
    };
    expect(
      await firstValueFrom(interceptor.intercept(context, cachedHandler)),
    ).toEqual({ result: true });
    options = {};
    expect(await firstValueFrom(interceptor.intercept(context, next))).toEqual({
      result: true,
    });
  });

  it('isolates interceptor keys for identical arguments across tenants', async () => {
    const store = new InMemoryCacheStore();
    const tags = new TagIndex();
    const tenantContext = new TenantContext();
    const reflector = {
      getAllAndOverride: (metadataKey: string): unknown =>
        metadataKey === CACHEABLE_METADATA ? { key: 'same-key' } : undefined,
    } as unknown as Reflector;
    class Controller {
      public handler(): void {}
    }
    const execution = {
      getHandler: () => Controller.prototype.handler,
      getClass: () => Controller,
      getArgs: () => ['same-argument'],
    } as unknown as ExecutionContext;
    const interceptor = new CacheableInterceptor(
      store,
      tags,
      reflector,
      new CacheInvalidationService(store, tags),
      new CacheKeyBuilder('cache', {
        enabled: true,
        context: tenantContext,
      }),
      new TtlStrategy(),
    );
    let calls = 0;
    const next: CallHandler = {
      handle: () => of(`value-${++calls}`),
    };
    const invoke = (tenantId: string): Promise<unknown> =>
      tenantContext.run(cacheTenant(tenantId), () =>
        firstValueFrom(interceptor.intercept(execution, next)),
      );

    await expect(invoke('alpha')).resolves.toBe('value-1');
    await expect(invoke('beta')).resolves.toBe('value-2');
    await expect(invoke('alpha')).resolves.toBe('value-1');
    expect(calls).toBe(2);
    await expect(
      firstValueFrom(interceptor.intercept(execution, next)),
    ).rejects.toThrow('Tenant context');
  });

  it('runs interceptor eviction before and after invocation', async () => {
    const store = new InMemoryCacheStore();
    const tags = new TagIndex();
    const invalidation = new CacheInvalidationService(store, tags);
    let cacheable: CacheableOptions | undefined;
    let evict:
      | {
          key?: string;
          tags?: readonly string[];
          namespace?: boolean;
          beforeInvocation?: boolean;
        }
      | undefined;
    const reflector = {
      getAllAndOverride: (metadataKey: string): unknown =>
        metadataKey === CACHEABLE_METADATA ? cacheable : evict,
    } as unknown as Reflector;
    class Controller {
      public handler(): void {}
    }
    const context = {
      getHandler: () => Controller.prototype.handler,
      getClass: () => Controller,
      getArgs: () => [],
    } as unknown as ExecutionContext;
    const interceptor = new CacheableInterceptor(
      store,
      tags,
      reflector,
      invalidation,
      new CacheKeyBuilder(),
      new TtlStrategy(),
    );
    const next: CallHandler = { handle: () => of('done') };

    expect(await firstValueFrom(interceptor.intercept(context, next))).toBe(
      'done',
    );
    await store.set('key', 1);
    await tags.add('key', ['tag']);
    evict = { key: 'key', tags: ['tag'] };
    expect(await firstValueFrom(interceptor.intercept(context, next))).toBe(
      'done',
    );
    expect(await store.has('key')).toBe(false);

    await store.set('all', 1);
    evict = { namespace: true, beforeInvocation: true };
    expect(await firstValueFrom(interceptor.intercept(context, next))).toBe(
      'done',
    );
    expect(await store.has('all')).toBe(false);

    cacheable = { key: 'cached', tags: ['static'] };
    evict = undefined;
    expect(await firstValueFrom(interceptor.intercept(context, next))).toBe(
      'done',
    );
    expect(await tags.keysForTag('static')).toEqual(['cached']);

    cacheable = undefined;
    evict = { tags: ['missing'] };
    expect(await firstValueFrom(interceptor.intercept(context, next))).toBe(
      'done',
    );
  });

  it('emits safe fallback metadata when injectable types are unavailable', () => {
    jest.isolateModules(() => {
      jest.doMock('@nestjs/core', () => ({ Reflector: undefined }));
      jest.doMock('../strategies/tag-index', () => ({ TagIndex: undefined }));
      jest.doMock('../invalidation/cache-invalidation.service', () => ({
        CacheInvalidationService: undefined,
      }));
      jest.doMock('../strategies/cache-key.builder', () => ({
        CacheKeyBuilder: undefined,
      }));
      jest.doMock('../strategies/ttl.strategy', () => ({
        TtlStrategy: undefined,
      }));
      expect(() =>
        // Jest doMock requires a synchronous CommonJS load in isolateModules.
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest mocking
        require('../decorators/cacheable.interceptor'),
      ).not.toThrow();

      jest.dontMock('../invalidation/cache-invalidation.service');
      expect(() =>
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest mocking
        require('../invalidation/cache-invalidation.service'),
      ).not.toThrow();
    });
    jest.dontMock('@nestjs/core');
    jest.dontMock('../strategies/tag-index');
    jest.dontMock('../invalidation/cache-invalidation.service');
    jest.dontMock('../strategies/cache-key.builder');
    jest.dontMock('../strategies/ttl.strategy');
  });
});
