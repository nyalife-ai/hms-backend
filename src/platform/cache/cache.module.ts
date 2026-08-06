import {
  DynamicModule,
  type InjectionToken,
  Module,
  Provider,
} from '@nestjs/common';
import { APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { TenantContext } from '../tenancy/tenant-context';
import { CacheStore } from './contracts/cache.interface';
import {
  CACHE_OPTIONS,
  CACHE_STORE,
  CACHE_TAG_INDEX,
  DISTRIBUTED_LOCK,
  REDIS_CLIENT,
} from './contracts/cache.tokens';
import { CacheableInterceptor } from './decorators/cacheable.interceptor';
import { CacheInvalidationService } from './invalidation/cache-invalidation.service';
import {
  DistributedLockService,
  InMemoryDistributedLock,
} from './locks/distributed-lock.service';
import { InMemoryCacheStore } from './redis/in-memory-cache.store';
import { RedisCacheStore } from './redis/redis-cache.store';
import { RedisClientLike } from './redis/redis.types';
import { CacheKeyBuilder } from './strategies/cache-key.builder';
import { TagIndex } from './strategies/tag-index';
import { TtlStrategy } from './strategies/ttl.strategy';

export interface CacheModuleOptions {
  readonly namespace?: string;
  readonly defaultTtlSeconds?: number;
  readonly store?: CacheStore;
  readonly redisClient?: RedisClientLike;
  readonly globalInterceptor?: boolean;
  readonly tenancy?: {
    readonly enabled: boolean;
    readonly context?: TenantContext;
    readonly includePrincipal?: boolean;
  };
}

export interface CacheModuleAsyncOptions<
  TDependencies extends readonly unknown[] = readonly unknown[],
> {
  readonly imports?: DynamicModule['imports'];
  readonly inject?: { readonly [TKey in keyof TDependencies]: InjectionToken };
  readonly useFactory: (
    ...dependencies: TDependencies
  ) => CacheModuleOptions | Promise<CacheModuleOptions>;
  readonly globalInterceptor?: boolean;
}

@Module({})
export class CacheModule {
  public static register(options: CacheModuleOptions = {}): DynamicModule {
    return this.create(
      { provide: CACHE_OPTIONS, useValue: options },
      options.globalInterceptor,
      options.redisClient === undefined
        ? []
        : [{ provide: REDIS_CLIENT, useValue: options.redisClient }],
    );
  }

  public static registerAsync<TDependencies extends readonly unknown[]>(
    options: CacheModuleAsyncOptions<TDependencies>,
  ): DynamicModule {
    return {
      ...this.create(
        {
          provide: CACHE_OPTIONS,
          useFactory: options.useFactory,
          inject: [...(options.inject ?? [])],
        },
        options.globalInterceptor,
      ),
      imports: options.imports,
    };
  }

  private static create(
    optionsProvider: Provider,
    globalInterceptor = false,
    additionalProviders: Provider[] = [],
  ): DynamicModule {
    const providers: Provider[] = [
      optionsProvider,
      ...additionalProviders,
      {
        provide: CACHE_STORE,
        useFactory: (options: CacheModuleOptions): CacheStore =>
          options.store ??
          (options.redisClient
            ? new RedisCacheStore(options.redisClient, options.namespace)
            : new InMemoryCacheStore()),
        inject: [CACHE_OPTIONS],
      },
      {
        provide: CACHE_TAG_INDEX,
        useFactory: (cacheStore: CacheStore): TagIndex =>
          new TagIndex(cacheStore),
        inject: [CACHE_STORE],
      },
      {
        provide: CacheKeyBuilder,
        useFactory: (options: CacheModuleOptions): CacheKeyBuilder =>
          new CacheKeyBuilder(options.namespace, options.tenancy),
        inject: [CACHE_OPTIONS],
      },
      {
        provide: TtlStrategy,
        useFactory: (options: CacheModuleOptions): TtlStrategy =>
          new TtlStrategy({
            defaultTtlSeconds: options.defaultTtlSeconds,
          }),
        inject: [CACHE_OPTIONS],
      },
      CacheInvalidationService,
      Reflector,
      CacheableInterceptor,
      {
        provide: DISTRIBUTED_LOCK,
        useFactory: (options: CacheModuleOptions) =>
          options.redisClient
            ? new DistributedLockService(options.redisClient)
            : new InMemoryDistributedLock(),
        inject: [CACHE_OPTIONS],
      },
    ];
    if (globalInterceptor) {
      providers.push({
        provide: APP_INTERCEPTOR,
        useExisting: CacheableInterceptor,
      });
    }

    return {
      module: CacheModule,
      providers,
      exports: [
        CACHE_STORE,
        CACHE_TAG_INDEX,
        DISTRIBUTED_LOCK,
        CacheInvalidationService,
        CacheKeyBuilder,
        TtlStrategy,
        CacheableInterceptor,
      ],
    };
  }
}
