import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import {
  allowInMemoryDefaults,
  resolveIsProduction,
} from '../../platform/architecture/production-defaults';
import { ConfigurationModule } from '../../platform/configuration/configuration.module';
import { ObservabilityModule } from '../../platform/observability/observability.module';
import {
  ReliabilityModule,
  type ReliabilityModuleOptions,
} from '../../platform/reliability/reliability.module';
import { DatabaseModule } from '../../platform/database/database.module';
import { SecurityModule } from '../../platform/security/security.module';
import { TenancyModule } from '../../platform/tenancy/tenancy.module';
import { ApiModule } from '../../platform/api/api.module';
import { MessagingModule } from '../../platform/messaging/messaging.module';
import { QueueModule } from '../../platform/queue/queue.module';
import { DatabaseInfrastructureModule } from '../database/database.infrastructure.module';
import { RedisInfrastructureModule } from '../redis/redis.module';
import { MessagingInfrastructureModule } from '../messaging/messaging.infrastructure.module';
import { StorageInfrastructureModule } from '../storage/storage.infrastructure.module';
import { MESSAGE_BROKER } from '../../platform/messaging/messaging.module';
import { DATABASE_ADAPTER } from '../../platform/database/providers/database.tokens';
import { DatabaseHealthIndicator } from '../database/health/database-health.indicator';
import { RedisClientService } from '../redis/redis-client.service';
import { RedisHealthIndicator } from '../redis/redis.health.indicator';
import {
  isCapabilityObject,
  type FoundationCapability,
  type FoundationImport,
  type FoundationModuleOptions,
} from './foundation.options';
import { FOUNDATION_HEALTH, FOUNDATION_OPTIONS } from './foundation.tokens';
import {
  FOUNDATION_HEALTH_SOURCES,
  FoundationHealthService,
  type FoundationHealthSources,
} from './health/foundation-health.service';
import { buildPipelineProviders } from './pipeline/build-pipeline.providers';
import {
  FOUNDATION_SHUTDOWN_TARGETS,
  FoundationShutdownRegistrar,
  type FoundationShutdownTargets,
} from './shutdown/foundation-shutdown.registrar';
import {
  buildHealthSources,
  buildShutdownTargets,
} from './foundation.factories';
import { GracefulShutdownService } from '../../platform/reliability/shutdown/graceful-shutdown.service';

/**
 * Production-ready composition root for request pipeline + infrastructure
 * journeys. Does not import business modules from `src/modules`.
 *
 * ## Capability model
 * Each journey (database, Redis, security, …) is opt-in. Pass a nested options
 * object (or explicit `module` DynamicModule) to enable; omit or set `false`
 * to leave it out. Production fails fast when an enabled capability lacks a
 * durable/external provider unless `allowInMemory: true`.
 *
 * ## HTTP pipeline
 * See {@link FOUNDATION_PIPELINE_ORDER} in `./foundation.tokens`. APP_GUARD /
 * APP_INTERCEPTOR / APP_PIPE bindings are registered only when `pipeline.*`
 * flags are set.
 *
 * ## Bootstrap note
 * Prefer composing apps with `FoundationModule.register(...)`. Existing
 * `AppModule` still wires legacy `src/modules` observability/auth and is left
 * unchanged to avoid dual registration conflicts.
 */
@Module({})
export class FoundationModule {
  public static register(options: FoundationModuleOptions = {}): DynamicModule {
    const isProduction = resolveIsProduction(options);
    const allowInMemory = allowInMemoryDefaults(options);
    const productionPolicy: ProductionPolicy = { isProduction, allowInMemory };

    assertProductionCapabilities(options, productionPolicy);

    const imports: FoundationImport[] = [];
    const providers: Provider[] = [
      { provide: FOUNDATION_OPTIONS, useValue: Object.freeze({ ...options }) },
      {
        provide: FOUNDATION_HEALTH_SOURCES,
        useFactory: buildHealthSources,
        inject: [
          { token: DatabaseHealthIndicator, optional: true },
          { token: RedisHealthIndicator, optional: true },
          { token: MESSAGE_BROKER, optional: true },
        ],
      },
      {
        provide: FoundationHealthService,
        useFactory: (
          options: FoundationModuleOptions,
          sources: FoundationHealthSources,
        ): FoundationHealthService =>
          new FoundationHealthService(options, sources),
        inject: [FOUNDATION_OPTIONS, FOUNDATION_HEALTH_SOURCES],
      },
      { provide: FOUNDATION_HEALTH, useExisting: FoundationHealthService },
    ];
    const exported: Array<string | symbol | Provider> = [
      FOUNDATION_OPTIONS,
      FOUNDATION_HEALTH,
      FOUNDATION_HEALTH_SOURCES,
      FoundationHealthService,
    ];

    if (isEnabled(options.reliability)) {
      providers.push(
        {
          provide: FOUNDATION_SHUTDOWN_TARGETS,
          useFactory: buildShutdownTargets,
          inject: [
            { token: DATABASE_ADAPTER, optional: true },
            { token: RedisClientService, optional: true },
            { token: MESSAGE_BROKER, optional: true },
          ],
        },
        {
          provide: FoundationShutdownRegistrar,
          useFactory: (
            foundationOptions: FoundationModuleOptions,
            shutdown: GracefulShutdownService,
            targets: FoundationShutdownTargets,
          ): FoundationShutdownRegistrar => {
            const registrar = new FoundationShutdownRegistrar(
              foundationOptions,
              shutdown,
              targets,
            );
            registrar.onModuleInit();
            return registrar;
          },
          inject: [
            FOUNDATION_OPTIONS,
            GracefulShutdownService,
            FOUNDATION_SHUTDOWN_TARGETS,
          ],
        },
      );
      exported.push(FOUNDATION_SHUTDOWN_TARGETS, FoundationShutdownRegistrar);
    }

    pushCapability(imports, options.configuration, (config) =>
      ConfigurationModule.register(stripModule(config)),
    );
    pushCapability(imports, options.observability, (obs) =>
      ObservabilityModule.register({
        ...stripModule(obs),
        ...inheritProduction(options, stripModule(obs)),
      }),
    );
    pushCapability(imports, options.reliability, (rel) => {
      const nested = stripModule(rel);
      return ReliabilityModule.register({
        ...nested,
        ...inheritProduction(options, nested),
        shutdown: options.shutdown ?? nested.shutdown,
      });
    });

    pushDatabase(imports, options, productionPolicy);
    pushRedis(imports, options);
    pushSecurity(imports, options, productionPolicy);
    pushTenancy(imports, options);
    pushApi(imports, options, productionPolicy);
    pushMessaging(imports, options);
    pushQueue(imports, options);
    pushStorage(imports, options, productionPolicy);

    for (const extra of options.imports ?? []) {
      imports.push(extra);
    }

    providers.push(
      ...buildPipelineProviders(options.pipeline, {
        securityEnabled: isEnabled(options.security),
        tenancyEnabled: isEnabled(options.tenancy),
        reliabilityEnabled: isEnabled(options.reliability),
        observabilityEnabled: isEnabled(options.observability),
      }),
    );
    for (const provider of options.providers ?? []) {
      providers.push(provider);
    }
    for (const token of options.exports ?? []) {
      exported.push(token as string | symbol | Provider);
    }

    return {
      module: FoundationModule,
      global: options.global === true,
      imports,
      providers,
      exports: exported,
    };
  }
}

type ProductionPolicy = Readonly<{
  isProduction: boolean;
  allowInMemory: boolean;
}>;

type ProductionAwareSlice = {
  readonly environment?: string;
  readonly isProduction?: boolean;
  readonly allowInMemory?: boolean;
  readonly shutdown?: ReliabilityModuleOptions['shutdown'];
};

const isEnabled = (value: unknown): boolean =>
  value !== undefined && value !== false;

const stripModule = <T extends object>(
  value: T & { readonly module?: FoundationImport },
): Omit<T, 'module'> =>
  Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== 'module'),
  ) as Omit<T, 'module'>;

const inheritProduction = (
  root: FoundationModuleOptions,
  nested: ProductionAwareSlice,
): ProductionAwareSlice => ({
  environment: nested.environment ?? root.environment,
  isProduction: nested.isProduction ?? root.isProduction,
  allowInMemory: nested.allowInMemory ?? root.allowInMemory,
});

const pushCapability = <T extends object>(
  imports: FoundationImport[],
  capability: FoundationCapability<T> | undefined,
  factory: (
    options: T & { readonly module?: FoundationImport },
  ) => FoundationImport,
): void => {
  if (!isCapabilityObject(capability)) {
    return;
  }
  if (capability.module !== undefined) {
    imports.push(capability.module);
    return;
  }
  imports.push(factory(capability));
};

const assertHasProviderSource = (
  label: string,
  hasSource: boolean,
  policy: ProductionPolicy,
): void => {
  if (!hasSource && policy.isProduction && !policy.allowInMemory) {
    throw new Error(
      `FoundationModule: ${label} is enabled in production but no durable module/options were supplied (provide module or options, or set allowInMemory: true)`,
    );
  }
};

const assertProductionCapabilities = (
  options: FoundationModuleOptions,
  policy: ProductionPolicy,
): void => {
  if (!policy.isProduction || policy.allowInMemory) {
    return;
  }

  if (isCapabilityObject(options.database)) {
    const db = options.database;
    assertHasProviderSource(
      'database',
      db.module !== undefined ||
        db.platform !== undefined ||
        db.infrastructure !== undefined,
      policy,
    );
  }
  if (isCapabilityObject(options.redis)) {
    const redis = options.redis;
    assertHasProviderSource(
      'redis',
      redis.module !== undefined || redis.options !== undefined,
      policy,
    );
  }
  if (isCapabilityObject(options.security)) {
    const security = options.security;
    assertHasProviderSource(
      'security',
      security.module !== undefined || security.options !== undefined,
      policy,
    );
  }
  if (isCapabilityObject(options.messaging)) {
    const messaging = options.messaging;
    assertHasProviderSource(
      'messaging',
      messaging.module !== undefined ||
        messaging.platform !== undefined ||
        messaging.infrastructure !== undefined,
      policy,
    );
  }
  if (isCapabilityObject(options.queue)) {
    const queue = options.queue;
    assertHasProviderSource(
      'queue',
      queue.module !== undefined || queue.options !== undefined,
      policy,
    );
  }
  if (isCapabilityObject(options.storage)) {
    const storage = options.storage;
    assertHasProviderSource(
      'storage',
      storage.module !== undefined || storage.options !== undefined,
      policy,
    );
  }
  if (isCapabilityObject(options.observability)) {
    const obs = options.observability;
    if (
      obs.module === undefined &&
      (!obs.monitor || !obs.tracer || !obs.errorReporter || !obs.metrics)
    ) {
      throw new Error(
        'FoundationModule: observability requires external monitor, tracer, errorReporter, and metrics in production (or set allowInMemory: true)',
      );
    }
  }
};

const pushDatabase = (
  imports: FoundationImport[],
  options: FoundationModuleOptions,
  policy: ProductionPolicy,
): void => {
  if (!isCapabilityObject(options.database)) {
    return;
  }
  const db = options.database;
  if (db.module !== undefined) {
    imports.push(db.module);
    return;
  }
  if (db.infrastructure !== undefined) {
    imports.push(DatabaseInfrastructureModule.forRoot(db.infrastructure));
    return;
  }
  if (db.platform !== undefined) {
    imports.push(
      DatabaseModule.forRoot({
        ...db.platform,
        isProduction: db.platform.isProduction ?? policy.isProduction,
      }),
    );
    return;
  }
  throw new Error(
    'FoundationModule: database enabled without module/platform/infrastructure options',
  );
};

const pushRedis = (
  imports: FoundationImport[],
  options: FoundationModuleOptions,
): void => {
  if (!isCapabilityObject(options.redis)) {
    return;
  }
  const redis = options.redis;
  if (redis.module !== undefined) {
    imports.push(redis.module);
    return;
  }
  if (redis.options !== undefined) {
    imports.push(RedisInfrastructureModule.register(redis.options));
    return;
  }
  throw new Error('FoundationModule: redis enabled without module/options');
};

const pushSecurity = (
  imports: FoundationImport[],
  options: FoundationModuleOptions,
  policy: ProductionPolicy,
): void => {
  if (!isCapabilityObject(options.security)) {
    return;
  }
  const security = options.security;
  if (security.module !== undefined) {
    imports.push(security.module);
    return;
  }
  imports.push(
    SecurityModule.forRoot({
      ...(security.options ?? {}),
      isProduction: security.options?.isProduction ?? policy.isProduction,
      allowInMemory: security.options?.allowInMemory ?? options.allowInMemory,
    }),
  );
};

const pushTenancy = (
  imports: FoundationImport[],
  options: FoundationModuleOptions,
): void => {
  if (!isCapabilityObject(options.tenancy)) {
    return;
  }
  const tenancy = options.tenancy;
  if (tenancy.module !== undefined) {
    imports.push(tenancy.module);
    return;
  }
  const nested = tenancy.options ?? {};
  // Foundation owns APP_INTERCEPTOR registration via pipeline.tenant.
  imports.push(
    TenancyModule.register({
      ...nested,
      globalInterceptor: false,
      environment:
        nested.environment ??
        (resolveIsProduction(options) ? 'production' : 'development'),
    }),
  );
};

const pushApi = (
  imports: FoundationImport[],
  options: FoundationModuleOptions,
  policy: ProductionPolicy,
): void => {
  if (!isCapabilityObject(options.api)) {
    return;
  }
  const api = options.api;
  if (api.module !== undefined) {
    imports.push(api.module);
    return;
  }
  imports.push(
    ApiModule.register({
      ...(api.options ?? {}),
      isProduction: api.options?.isProduction ?? policy.isProduction,
      allowInMemoryIdempotency:
        api.options?.allowInMemoryIdempotency ?? options.allowInMemory,
      healthIndicators:
        api.options?.healthIndicators ?? options.health?.indicators,
      healthTimeoutMilliseconds:
        api.options?.healthTimeoutMilliseconds ??
        options.health?.timeoutMilliseconds,
    }),
  );
};

const pushMessaging = (
  imports: FoundationImport[],
  options: FoundationModuleOptions,
): void => {
  if (!isCapabilityObject(options.messaging)) {
    return;
  }
  const messaging = options.messaging;
  if (messaging.module !== undefined) {
    imports.push(messaging.module);
    return;
  }
  if (messaging.infrastructure !== undefined) {
    imports.push(
      MessagingInfrastructureModule.register(messaging.infrastructure),
    );
    return;
  }
  if (messaging.platform !== undefined) {
    imports.push(
      MessagingModule.register({
        ...messaging.platform,
        ...inheritProduction(options, messaging.platform),
      }),
    );
    return;
  }
  throw new Error(
    'FoundationModule: messaging enabled without module/platform/infrastructure options',
  );
};

const pushQueue = (
  imports: FoundationImport[],
  options: FoundationModuleOptions,
): void => {
  if (!isCapabilityObject(options.queue)) {
    return;
  }
  const queue = options.queue;
  if (queue.module !== undefined) {
    imports.push(queue.module);
    return;
  }
  imports.push(
    QueueModule.register({
      ...(queue.options ?? {}),
      ...inheritProduction(options, queue.options ?? {}),
    }),
  );
};

const pushStorage = (
  imports: FoundationImport[],
  options: FoundationModuleOptions,
  policy: ProductionPolicy,
): void => {
  if (!isCapabilityObject(options.storage)) {
    return;
  }
  const storage = options.storage;
  if (storage.module !== undefined) {
    imports.push(storage.module);
    return;
  }
  if (storage.options !== undefined) {
    if (
      policy.isProduction &&
      !policy.allowInMemory &&
      (storage.options.provider === 'local' ||
        storage.options.provider === undefined)
    ) {
      const envProvider =
        storage.options.environment?.['STORAGE_PROVIDER'] ??
        process.env['STORAGE_PROVIDER'];
      if (envProvider === undefined || envProvider === 'local') {
        throw new Error(
          'FoundationModule: storage requires a durable provider (s3|minio|azure|gcs) in production (or set allowInMemory: true)',
        );
      }
    }
    imports.push(StorageInfrastructureModule.register(storage.options));
    return;
  }
  throw new Error('FoundationModule: storage enabled without module/options');
};
