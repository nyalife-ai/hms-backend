import { DynamicModule, Module, Provider } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import {
  type ProductionAwareOptions,
  resolveIsProduction,
} from '../architecture/production-defaults';
import { InMemoryDistributedLock } from './locking/in-memory-distributed-lock';
import {
  DistributedLock,
  RedisClientLike,
} from './locking/distributed-lock.interface';
import { RedisDistributedLock } from './locking/redis-distributed-lock';
import { RetryExecutor } from './retry/retry.executor';
import { InMemoryServiceRegistry } from './service-discovery/in-memory-service-registry';
import { ServiceDiscovery } from './service-discovery/service-discovery.interface';
import { ActiveRequestTracker } from './shutdown/active-request.tracker';
import { ActiveRequestInterceptor } from './shutdown/active-request.interceptor';
import {
  GracefulShutdownOptions,
  GracefulShutdownService,
} from './shutdown/graceful-shutdown.service';

export const DISTRIBUTED_LOCK = Symbol('RELIABILITY_DISTRIBUTED_LOCK');
export const SERVICE_REGISTRY = Symbol('RELIABILITY_SERVICE_REGISTRY');

/**
 * Lock boundary notes (duplicate implementations by design):
 *
 * - `reliability/locking` — HA coordination (leader election, critical sections)
 *   across API instances. Prefer Redis-backed {@link RedisDistributedLock}.
 * - `cache/locks` — short-lived cache stampede / mutex locks scoped to the
 *   cache subsystem (different token surface; do not mix).
 * - `scheduling` — scheduler job mutex via SchedulerLock; may wrap a
 *   reliability {@link DistributedLock} but keeps a narrower renew/release API.
 *
 * Full unification would break existing DI tokens; use the adapter that matches
 * the subsystem boundary above.
 */
export interface ReliabilityModuleOptions extends ProductionAwareOptions {
  /** Redis client for distributed locks. Preferred in production HA setups. */
  readonly redisClient?: RedisClientLike;
  /** Explicit lock. Required in production when HA is enabled unless redisClient. */
  readonly lock?: DistributedLock;
  /**
   * External service registry. Required in production when HA features are
   * enabled unless `allowInMemory`.
   */
  readonly serviceRegistry?: ServiceDiscovery;
  /**
   * Enable high-availability features (distributed lock + service registry).
   * Defaults to true in production, false otherwise.
   */
  readonly enableHa?: boolean;
  readonly shutdown?: GracefulShutdownOptions;
  /** Register active-request tracking globally for graceful draining. */
  readonly globalRequestTracking?: boolean;
  /** Bounds for the in-memory service registry when used. */
  readonly registryMaxInstances?: number;
}

@Module({})
export class ReliabilityModule {
  public static register(
    options: ReliabilityModuleOptions = {},
  ): DynamicModule {
    const isProduction = resolveIsProduction(options);
    const enableHa = options.enableHa ?? isProduction;
    const requireExternal = enableHa && isProduction && !options.allowInMemory;

    const lock = ReliabilityModule.resolveLock(options, requireExternal);
    const registry = ReliabilityModule.resolveRegistry(
      options,
      requireExternal,
    );

    const providers: Provider[] = [
      {
        provide: ActiveRequestTracker,
        useFactory: (): ActiveRequestTracker => new ActiveRequestTracker(),
      },
      {
        provide: GracefulShutdownService,
        inject: [ActiveRequestTracker],
        useFactory: (tracker: ActiveRequestTracker): GracefulShutdownService =>
          new GracefulShutdownService(
            tracker,
            undefined,
            undefined,
            undefined,
            options.shutdown,
          ),
      },
      {
        provide: ActiveRequestInterceptor,
        inject: [ActiveRequestTracker],
        useFactory: (tracker: ActiveRequestTracker): ActiveRequestInterceptor =>
          new ActiveRequestInterceptor(tracker),
      },
      {
        provide: RetryExecutor,
        useFactory: (): RetryExecutor => new RetryExecutor(),
      },
      { provide: SERVICE_REGISTRY, useValue: registry },
      { provide: DISTRIBUTED_LOCK, useValue: lock },
    ];
    if (registry instanceof InMemoryServiceRegistry) {
      providers.push({ provide: InMemoryServiceRegistry, useValue: registry });
    }
    if (options.globalRequestTracking) {
      providers.push({
        provide: APP_INTERCEPTOR,
        useExisting: ActiveRequestInterceptor,
      });
    }

    const moduleExports: Array<string | symbol | Provider> = [
      ActiveRequestTracker,
      ActiveRequestInterceptor,
      GracefulShutdownService,
      RetryExecutor,
      SERVICE_REGISTRY,
      DISTRIBUTED_LOCK,
    ];
    if (registry instanceof InMemoryServiceRegistry) {
      moduleExports.push(InMemoryServiceRegistry);
    }

    return {
      module: ReliabilityModule,
      providers,
      exports: moduleExports,
    };
  }

  private static resolveLock(
    options: ReliabilityModuleOptions,
    requireExternal: boolean,
  ): DistributedLock {
    if (options.lock) {
      if (requireExternal && options.lock instanceof InMemoryDistributedLock) {
        throw new Error(
          'ReliabilityModule: InMemoryDistributedLock is not safe for HA production; provide Redis/distributed lock (or set allowInMemory: true)',
        );
      }
      return options.lock;
    }
    if (options.redisClient) {
      return new RedisDistributedLock(options.redisClient);
    }
    if (requireExternal) {
      throw new Error(
        'ReliabilityModule: distributed lock/client is required in production when HA is enabled (provide redisClient or lock, or set allowInMemory: true / enableHa: false)',
      );
    }
    return new InMemoryDistributedLock();
  }

  private static resolveRegistry(
    options: ReliabilityModuleOptions,
    requireExternal: boolean,
  ): ServiceDiscovery {
    if (options.serviceRegistry) {
      if (
        requireExternal &&
        options.serviceRegistry instanceof InMemoryServiceRegistry
      ) {
        throw new Error(
          'ReliabilityModule: InMemoryServiceRegistry is not suitable for HA production; provide an external registry (or set allowInMemory: true)',
        );
      }
      return options.serviceRegistry;
    }
    if (requireExternal) {
      throw new Error(
        'ReliabilityModule: external serviceRegistry is required in production when HA is enabled (or set allowInMemory: true / enableHa: false)',
      );
    }
    return new InMemoryServiceRegistry({
      maxInstances: options.registryMaxInstances,
    });
  }
}
