import {
  CallHandler,
  ExecutionContext,
  Module,
  ValidationPipe,
  type NestInterceptor,
} from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { lastValueFrom, of, throwError } from 'rxjs';
import {
  ConfigurationService,
  ConfigurationModule,
} from '../../../platform/configuration';
import {
  OBSERVABILITY_MONITOR,
  ObservabilityModule,
} from '../../../platform/observability';
import { MonitoringService } from '../../../platform/observability/monitoring/monitoring.service';
import { MetricsCollector } from '../../../platform/observability/metrics/metrics-collector';
import { InMemoryTracer } from '../../../platform/observability/tracing/in-memory-tracer';
import { InMemoryErrorReporter } from '../../../platform/observability/error-tracking/in-memory-error-reporter';
import { CORRELATION_ID_HEADER } from '../../../platform/observability/logging/correlation';
import {
  ActiveRequestTracker,
  GracefulShutdownService,
  ReliabilityModule,
} from '../../../platform/reliability';
import { AuthGuard } from '../../../platform/security/auth/guards/auth.guard';
import { RateLimitGuard } from '../../../platform/security/http/rate-limit.guard';
import { TenantContextInterceptor } from '../../../platform/tenancy/tenant-context.interceptor';
import { TenancyModule } from '../../../platform/tenancy/tenancy.module';
import { TenantRegistry } from '../../../platform/tenancy/tenant-registry';
import { TenantResolver } from '../../../platform/tenancy/tenant-resolver';
import { PrincipalTenantAccessEvaluator } from '../../../platform/tenancy/tenant-access.evaluator';
import type { TenantConfiguration } from '../../../platform/tenancy/tenancy.types';
import { HealthService } from '../../../platform/api';
import { MessagingModule } from '../../../platform/messaging';
import { QUEUE_ADAPTER } from '../../../platform/queue';
import { DatabaseModule } from '../../../platform/database';
import { RedisInfrastructureModule } from '../../redis/redis.module';
import { RedisClientService } from '../../redis/redis-client.service';
import { RedisHealthIndicator } from '../../redis/redis.health.indicator';
import { DatabaseHealthIndicator } from '../../database/health/database-health.indicator';
import { StorageInfrastructureModule } from '../../storage/storage.infrastructure.module';
import { DatabaseInfrastructureModule } from '../../database/database.infrastructure.module';
import {
  ActiveRequestInterceptor,
  BrokerHealthIndicator,
  CorrelationInterceptor,
  FoundationHealthService,
  FoundationModule,
  FoundationShutdownRegistrar,
  FOUNDATION_HEALTH,
  FOUNDATION_OPTIONS,
  FOUNDATION_PIPELINE_ORDER,
  TracingInterceptor,
  buildPipelineProviders,
} from '..';
import {
  buildHealthSources,
  buildShutdownTargets,
} from '../foundation.factories';

@Module({})
class ExtensionModule {}

const clock = {
  now: (): Date => new Date(),
  timestamp: (): number => Date.now(),
};

const productionObservability = {
  monitor: new MonitoringService(),
  tracer: new InMemoryTracer(clock),
  errorReporter: new InMemoryErrorReporter(),
  metrics: new MetricsCollector(),
};

const sampleTenant = (id: string): TenantConfiguration => ({
  id,
  name: `Tenant ${id}`,
  isolation: 'shared-database',
  settings: {},
  metadata: {},
});

const httpContext = (
  headers: Record<string, string | string[] | undefined> = {},
): ExecutionContext => {
  const request: {
    headers: Record<string, string | string[] | undefined>;
    correlationId?: string;
  } = { headers };
  const response = {
    setHeader: (_name: string, _value: string): void => undefined,
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
    getHandler: () => ({ name: 'handle' }),
    getClass: () => ({ name: 'TestController' }),
  } as unknown as ExecutionContext;
};

const callHandler = (value: unknown = 'ok'): CallHandler => ({
  handle: () => of(value),
});

describe('FoundationModule', () => {
  it('accepts register() with default empty options', () => {
    const dynamic = FoundationModule.register();
    expect(dynamic.module).toBe(FoundationModule);
    expect(dynamic.imports).toEqual([]);
  });

  describe('dev composition', () => {
    it('registers configuration, observability, reliability, security, queue', async () => {
      const dynamic = FoundationModule.register({
        isProduction: false,
        configuration: { values: { app: 'test' } },
        observability: {},
        reliability: { enableHa: false },
        security: {},
        api: {
          module: {
            module: class ApiStubModule {},
            providers: [
              { provide: HealthService, useValue: new HealthService() },
            ],
            exports: [HealthService],
          },
        },
        queue: {},
        global: true,
      });

      expect(dynamic.global).toBe(true);
      expect(dynamic.imports?.length).toBeGreaterThanOrEqual(5);

      const moduleRef = await Test.createTestingModule({
        imports: [dynamic],
      }).compile();

      expect(moduleRef.get(FOUNDATION_OPTIONS)).toMatchObject({
        isProduction: false,
      });
      expect(moduleRef.get(ConfigurationService).get('app')).toBe('test');
      expect(moduleRef.get(OBSERVABILITY_MONITOR)).toBeDefined();
      expect(moduleRef.get(ActiveRequestTracker)).toBeInstanceOf(
        ActiveRequestTracker,
      );
      expect(moduleRef.get(GracefulShutdownService)).toBeInstanceOf(
        GracefulShutdownService,
      );
      expect(moduleRef.get(HealthService)).toBeInstanceOf(HealthService);
      expect(moduleRef.get(AuthGuard)).toBeInstanceOf(AuthGuard);
      expect(moduleRef.get(QUEUE_ADAPTER)).toBeDefined();
      expect(moduleRef.get(FOUNDATION_HEALTH)).toBeInstanceOf(
        FoundationHealthService,
      );
      await moduleRef.close();
    });

    it('skips disabled capabilities and accepts explicit false', () => {
      const dynamic = FoundationModule.register({
        isProduction: false,
        configuration: false,
        observability: false,
        reliability: false,
        database: false,
        redis: false,
        security: false,
        tenancy: false,
        api: false,
        messaging: false,
        queue: false,
        storage: false,
      });
      expect(dynamic.imports).toEqual([]);
    });

    it('imports explicit extension modules and custom providers/exports', async () => {
      const token = Symbol('CUSTOM');
      const dynamic = FoundationModule.register({
        isProduction: false,
        imports: [ExtensionModule],
        providers: [{ provide: token, useValue: 42 }],
        exports: [token],
      });
      const moduleRef = await Test.createTestingModule({
        imports: [dynamic],
      }).compile();
      expect(moduleRef.get(token)).toBe(42);
      await moduleRef.close();
    });

    it('forwards explicit DynamicModule via capability.module', () => {
      const custom = ConfigurationModule.register({ values: { x: 1 } });
      const dynamic = FoundationModule.register({
        isProduction: false,
        configuration: { module: custom },
        observability: { module: ObservabilityModule.register({}) },
        reliability: {
          module: ReliabilityModule.register({ enableHa: false }),
        },
        database: {
          module: DatabaseModule.forRoot({
            provider: 'prisma',
            prismaClientFactory: () => ({
              $connect: jest.fn(),
              $disconnect: jest.fn(),
              $transaction: jest.fn(),
            }),
            allowNoopMigrations: true,
            isProduction: false,
          }),
        },
        security: {
          module: {
            module: class SecurityStub {},
            providers: [],
            exports: [],
          },
        },
        tenancy: {
          module: TenancyModule.register({
            environment: 'development',
            globalInterceptor: false,
          }),
        },
        api: {
          module: {
            module: class ApiStub {},
            providers: [],
            exports: [],
          },
        },
        redis: {
          module: {
            module: class RedisStub {},
            providers: [],
            exports: [],
          },
        },
        messaging: {
          module: {
            module: class MessagingStub {},
            providers: [],
            exports: [],
          },
        },
        queue: {
          module: {
            module: class QueueStub {},
            providers: [],
            exports: [],
          },
        },
        storage: {
          module: {
            module: class StorageStub {},
            providers: [],
            exports: [],
          },
        },
      });
      expect(dynamic.imports?.length).toBe(11);
    });
  });

  describe('production fail-fast', () => {
    it('rejects observability without external providers', () => {
      expect(() =>
        FoundationModule.register({
          isProduction: true,
          observability: {},
        }),
      ).toThrow(/observability requires external monitor/);
    });

    it('accepts observability with external providers', () => {
      expect(() =>
        FoundationModule.register({
          isProduction: true,
          observability: { ...productionObservability },
        }),
      ).not.toThrow();
    });

    it('rejects enabled database/redis/security/messaging/queue/storage without sources', () => {
      expect(() =>
        FoundationModule.register({ isProduction: true, database: {} }),
      ).toThrow(/database is enabled in production/);
      expect(() =>
        FoundationModule.register({ isProduction: true, redis: {} }),
      ).toThrow(/redis is enabled in production/);
      expect(() =>
        FoundationModule.register({ isProduction: true, security: {} }),
      ).toThrow(/security is enabled in production/);
      expect(() =>
        FoundationModule.register({ isProduction: true, messaging: {} }),
      ).toThrow(/messaging is enabled in production/);
      expect(() =>
        FoundationModule.register({ isProduction: true, queue: {} }),
      ).toThrow(/queue is enabled in production/);
      expect(() =>
        FoundationModule.register({ isProduction: true, storage: {} }),
      ).toThrow(/storage is enabled in production/);
    });

    it('rejects local storage in production without allowInMemory', () => {
      expect(() =>
        FoundationModule.register({
          isProduction: true,
          storage: { options: { provider: 'local' } },
        }),
      ).toThrow(/durable provider/);
    });

    it('allows durable storage provider in production', () => {
      expect(() =>
        FoundationModule.register({
          isProduction: true,
          storage: {
            options: {
              provider: 's3',
              environment: {
                STORAGE_PROVIDER: 's3',
                STORAGE_BUCKET: 'bucket',
                AWS_REGION: 'us-east-1',
              },
            },
          },
        }),
      ).not.toThrow();
    });

    it('allows in-memory when allowInMemory is explicit', () => {
      const dynamic = FoundationModule.register({
        isProduction: true,
        allowInMemory: true,
        observability: {},
        reliability: { enableHa: false },
        security: { options: {} },
        api: { options: {} },
        queue: { options: {} },
        messaging: { platform: { enableWebhooks: false } },
      });
      expect(dynamic.imports?.length).toBeGreaterThan(0);
    });

    it('propagates allowInMemory to nested platform modules', () => {
      expect(() =>
        FoundationModule.register({
          isProduction: true,
          allowInMemory: true,
          security: { options: { authStrategies: [] } },
        }),
      ).not.toThrow();
    });
  });

  describe('capability wiring', () => {
    it('wires platform database when platform options supplied', () => {
      const prisma = {
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        $transaction: jest.fn(),
      };
      const dynamic = FoundationModule.register({
        isProduction: false,
        database: {
          platform: {
            provider: 'prisma',
            prismaClientFactory: () => prisma,
            allowNoopMigrations: true,
            isProduction: false,
          },
        },
      });
      expect(dynamic.imports?.[0]).toMatchObject({
        module: DatabaseModule,
      });
    });

    it('wires infrastructure database when infrastructure options supplied', () => {
      const dynamic = FoundationModule.register({
        isProduction: false,
        database: {
          infrastructure: {
            provider: 'prisma',
            prismaClientFactory: () => ({
              $connect: jest.fn(),
              $disconnect: jest.fn(),
              $transaction: jest.fn(),
              healthCheck: jest.fn(),
            }),
          },
        },
      });
      expect(dynamic.imports?.[0]).toMatchObject({
        module: DatabaseInfrastructureModule,
      });
    });

    it('wires redis, messaging platform, storage, and tenancy modules', () => {
      const driver = {
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn(),
        quit: jest.fn().mockResolvedValue('OK'),
        ping: jest.fn().mockResolvedValue('PONG'),
        on: jest.fn().mockReturnThis(),
        pipeline: jest.fn(),
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        exists: jest.fn(),
        expire: jest.fn(),
        ttl: jest.fn(),
        incr: jest.fn(),
        xadd: jest.fn(),
        xreadgroup: jest.fn(),
        xack: jest.fn(),
        xgroup: jest.fn(),
      };
      const dynamic = FoundationModule.register({
        isProduction: false,
        redis: { options: { driver: driver as never } },
        messaging: { platform: { enableWebhooks: false } },
        storage: {
          options: {
            provider: 'local',
            environment: {
              STORAGE_SIGNING_SECRET: 'test-secret-value-32chars!!',
              STORAGE_LOCAL_DIRECTORY: '/tmp/foundation-test-storage',
            },
          },
        },
        tenancy: {
          options: {
            environment: 'development',
            tenants: [sampleTenant('t1')],
          },
        },
      });
      expect(dynamic.imports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ module: RedisInfrastructureModule }),
          expect.objectContaining({ module: MessagingModule }),
          expect.objectContaining({ module: StorageInfrastructureModule }),
          expect.objectContaining({ module: TenancyModule }),
        ]),
      );
    });

    it('throws when database/redis/messaging/storage enabled without concrete options in non-production', () => {
      expect(() =>
        FoundationModule.register({ isProduction: false, database: {} }),
      ).toThrow(/database enabled without/);
      expect(() =>
        FoundationModule.register({ isProduction: false, redis: {} }),
      ).toThrow(/redis enabled without/);
      expect(() =>
        FoundationModule.register({ isProduction: false, messaging: {} }),
      ).toThrow(/messaging enabled without/);
      expect(() =>
        FoundationModule.register({ isProduction: false, storage: {} }),
      ).toThrow(/storage enabled without/);
    });

    it('covers empty nested options and development tenancy defaults', () => {
      expect(() =>
        FoundationModule.register({
          isProduction: false,
          tenancy: {},
          api: {},
        }),
      ).not.toThrow();

      const withHealthTimeout = new FoundationHealthService(
        {
          health: { timeoutMilliseconds: 25 },
        },
        {},
      );
      expect(withHealthTimeout.liveness().status).toBe('up');

      const withEmptyHealth = new FoundationHealthService({ health: {} }, {});
      expect(withEmptyHealth.liveness().status).toBe('up');

      const withoutHealth = new FoundationHealthService({}, {});
      expect(withoutHealth.liveness().status).toBe('up');
    });

    it('covers production tenancy environment default and platform isProduction inherit', () => {
      const registry = new TenantRegistry();
      registry.register(sampleTenant('t1'));
      const productionTenancy = FoundationModule.register({
        isProduction: true,
        allowInMemory: true,
        tenancy: {
          options: {
            registry,
            tenantResolver: new TenantResolver(registry, {
              strategy: 'header',
            }),
            accessEvaluator: new PrincipalTenantAccessEvaluator(),
          },
        },
        database: {
          platform: {
            provider: 'prisma',
            prismaClientFactory: () => ({
              $connect: jest.fn(),
              $disconnect: jest.fn(),
              $transaction: jest.fn(),
            }),
            allowNoopMigrations: true,
          },
        },
      });
      expect(productionTenancy.imports?.length).toBe(2);

      const envStorage = FoundationModule.register({
        isProduction: true,
        storage: {
          options: {
            environment: {
              STORAGE_PROVIDER: 's3',
              STORAGE_BUCKET: 'bucket',
              AWS_REGION: 'us-east-1',
            },
          },
        },
      });
      expect(envStorage.imports?.length).toBe(1);
    });

    it('uses infrastructure messaging when supplied', () => {
      const redis = {
        connect: jest.fn(),
        disconnect: jest.fn(),
        xadd: jest.fn(),
        xreadgroup: jest.fn(),
        xack: jest.fn(),
        xgroup: jest.fn(),
        onDisconnect: jest.fn(),
      };
      const dynamic = FoundationModule.register({
        isProduction: false,
        messaging: {
          infrastructure: {
            broker: 'redis-streams',
            redis: redis as never,
          },
        },
      });
      expect(dynamic.imports?.[0]).toMatchObject({
        providers: expect.any(Array),
      });
    });
  });

  describe('pipeline provider registration', () => {
    it('registers no APP_* providers by default', () => {
      const dynamic = FoundationModule.register({ isProduction: false });
      const tokens = (dynamic.providers ?? [])
        .map((provider) =>
          typeof provider === 'object' &&
          provider !== null &&
          'provide' in provider
            ? provider.provide
            : provider,
        )
        .filter(
          (token) =>
            token === APP_GUARD ||
            token === APP_INTERCEPTOR ||
            token === APP_PIPE,
        );
      expect(tokens).toEqual([]);
    });

    it('registers correlation, validation, tracing, and active-request when configured', () => {
      const dynamic = FoundationModule.register({
        isProduction: false,
        observability: {},
        reliability: { enableHa: false },
        pipeline: {
          correlation: true,
          validation: true,
          tracing: true,
          activeRequestTracking: true,
          order: [...FOUNDATION_PIPELINE_ORDER],
        },
      });
      const provides = (dynamic.providers ?? [])
        .filter(
          (provider): provider is { provide: unknown } =>
            typeof provider === 'object' &&
            provider !== null &&
            'provide' in provider,
        )
        .map((provider) => provider.provide);
      expect(provides).toEqual(
        expect.arrayContaining([APP_INTERCEPTOR, APP_PIPE, FOUNDATION_OPTIONS]),
      );
      expect(
        provides.filter((token) => token === APP_INTERCEPTOR).length,
      ).toBeGreaterThanOrEqual(3);
    });

    it('registers auth, tenant, and rateLimit only with required capabilities', () => {
      const registry = new TenantRegistry();
      registry.register(sampleTenant('t1'));
      const dynamic = FoundationModule.register({
        isProduction: false,
        security: {},
        tenancy: {
          options: {
            environment: 'development',
            registry,
            tenantResolver: new TenantResolver(registry, {
              strategy: 'header',
            }),
            accessEvaluator: new PrincipalTenantAccessEvaluator(),
          },
        },
        pipeline: {
          auth: true,
          tenant: true,
          rateLimit: true,
        },
      });
      const provides = (dynamic.providers ?? []).filter(
        (provider): provider is { provide: unknown; useExisting?: unknown } =>
          typeof provider === 'object' &&
          provider !== null &&
          'provide' in provider,
      );
      expect(
        provides.some(
          (provider) =>
            provider.provide === APP_GUARD &&
            provider.useExisting === AuthGuard,
        ),
      ).toBe(true);
      expect(
        provides.some(
          (provider) =>
            provider.provide === APP_GUARD &&
            provider.useExisting === RateLimitGuard,
        ),
      ).toBe(true);
      expect(
        provides.some(
          (provider) =>
            provider.provide === APP_INTERCEPTOR &&
            provider.useExisting === TenantContextInterceptor,
        ),
      ).toBe(true);
    });

    it('fails when pipeline stages lack required capabilities', () => {
      expect(() =>
        FoundationModule.register({
          isProduction: false,
          pipeline: { auth: true },
        }),
      ).toThrow(/pipeline.auth requires the security/);
      expect(() =>
        FoundationModule.register({
          isProduction: false,
          pipeline: { tenant: true },
        }),
      ).toThrow(/pipeline.tenant requires the tenancy/);
      expect(() =>
        FoundationModule.register({
          isProduction: false,
          pipeline: { rateLimit: true },
        }),
      ).toThrow(/pipeline.rateLimit requires the security/);
      expect(() =>
        FoundationModule.register({
          isProduction: false,
          pipeline: { tracing: true },
        }),
      ).toThrow(/pipeline.tracing requires the observability/);
      expect(() =>
        FoundationModule.register({
          isProduction: false,
          pipeline: { activeRequestTracking: true },
        }),
      ).toThrow(/pipeline.activeRequestTracking requires the reliability/);
      expect(() =>
        FoundationModule.register({
          isProduction: false,
          pipeline: { audit: true },
        }),
      ).toThrow(/pipeline.audit requires an explicit interceptor/);
    });

    it('accepts custom validation pipe and audit interceptor type/provider', () => {
      class AuditInterceptor implements NestInterceptor {
        public intercept(
          _context: ExecutionContext,
          next: CallHandler,
        ): ReturnType<CallHandler['handle']> {
          return next.handle();
        }
      }
      const pipe = new ValidationPipe({ transform: false });
      const withType = FoundationModule.register({
        isProduction: false,
        pipeline: { validation: pipe, audit: AuditInterceptor },
      });
      expect(withType.providers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ provide: APP_PIPE, useValue: pipe }),
          AuditInterceptor,
          expect.objectContaining({
            provide: APP_INTERCEPTOR,
            useExisting: AuditInterceptor,
          }),
        ]),
      );

      const withProvider = FoundationModule.register({
        isProduction: false,
        pipeline: {
          audit: {
            provide: APP_INTERCEPTOR,
            useClass: AuditInterceptor,
          },
        },
      });
      expect(withProvider.providers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            provide: APP_INTERCEPTOR,
            useClass: AuditInterceptor,
          }),
        ]),
      );
    });

    it('validates pipeline.order permutations', () => {
      expect(() =>
        buildPipelineProviders(
          { order: ['correlation'] as never },
          {
            securityEnabled: false,
            tenancyEnabled: false,
            reliabilityEnabled: false,
            observabilityEnabled: false,
          },
        ),
      ).toThrow(/pipeline.order must list all stages/);
      expect(() =>
        buildPipelineProviders(
          {
            order: [
              ...FOUNDATION_PIPELINE_ORDER.slice(0, -1),
              'correlation',
            ] as never,
          },
          {
            securityEnabled: false,
            tenancyEnabled: false,
            reliabilityEnabled: false,
            observabilityEnabled: false,
          },
        ),
      ).toThrow(/invalid or duplicate stage/);
    });
  });

  describe('pipeline interceptors', () => {
    it('CorrelationInterceptor propagates correlation ids', async () => {
      const interceptor = new CorrelationInterceptor();
      const context = httpContext({ [CORRELATION_ID_HEADER]: 'abc-123' });
      await lastValueFrom(interceptor.intercept(context, callHandler()));
      const request = context.switchToHttp().getRequest<{
        correlationId?: string;
      }>();
      expect(request.correlationId).toBe('abc-123');
    });

    it('ActiveRequestInterceptor tracks in-flight requests', async () => {
      const tracker = new ActiveRequestTracker();
      const withTracker = new ActiveRequestInterceptor(tracker);
      await lastValueFrom(withTracker.intercept(httpContext(), callHandler()));
      expect(tracker.count).toBe(0);

      const failing: CallHandler = {
        handle: () => throwError(() => new Error('fail')),
      };
      await expect(
        lastValueFrom(withTracker.intercept(httpContext(), failing)),
      ).rejects.toThrow('fail');
      expect(tracker.count).toBe(0);
    });

    it('TracingInterceptor opens spans and records errors', async () => {
      const tracer = new InMemoryTracer(clock);
      const interceptor = new TracingInterceptor(tracer);
      await lastValueFrom(interceptor.intercept(httpContext(), callHandler()));
      expect(tracer.list().length).toBe(1);

      const failing: CallHandler = {
        handle: () => throwError(() => new Error('boom')),
      };
      await expect(
        lastValueFrom(interceptor.intercept(httpContext(), failing)),
      ).rejects.toThrow('boom');
      expect(tracer.list().length).toBe(2);
      expect(tracer.list()[1]?.exceptions[0]?.message).toBe('boom');

      const nonError: CallHandler = {
        handle: () => throwError(() => 'string-fail'),
      };
      await expect(
        lastValueFrom(interceptor.intercept(httpContext(), nonError)),
      ).rejects.toBe('string-fail');

      const emptyNames = {
        switchToHttp: () => ({
          getRequest: () => ({ headers: {} }),
          getResponse: () => ({ setHeader: (): void => undefined }),
        }),
        getHandler: () => ({ name: '' }),
        getClass: () => ({ name: '' }),
      } as unknown as ExecutionContext;
      await lastValueFrom(interceptor.intercept(emptyNames, callHandler()));
      expect(tracer.list().at(-1)?.name).toBe('Controller.handler');

      const noop = new TracingInterceptor();
      await expect(
        lastValueFrom(noop.intercept(httpContext(), callHandler())),
      ).resolves.toBe('ok');
    });
  });

  describe('health composition', () => {
    it('composes liveness and readiness from enabled indicators', async () => {
      const databaseIndicator = {
        check: jest.fn().mockResolvedValue({
          database: { status: 'up', latencyMs: 1, details: { orm: 'prisma' } },
        }),
      } as unknown as DatabaseHealthIndicator;
      const redisIndicator = new RedisHealthIndicator({
        withTimeout: jest.fn(async (promise: Promise<unknown>) => promise),
        healthCheck: jest
          .fn()
          .mockResolvedValue({ status: 'up', latencyMs: 2 }),
      } as unknown as RedisClientService);
      const broker = {
        publish: jest.fn(),
        subscribe: jest.fn(),
        healthCheck: jest.fn().mockResolvedValue({
          status: 'down',
          latencyMs: 3,
          error: 'offline',
        }),
      };

      const health = new FoundationHealthService(
        {
          database: {},
          redis: {},
          messaging: {},
          health: {
            indicators: [
              {
                name: 'custom',
                check: async () => ({ name: 'custom', status: 'up' }),
              },
            ],
          },
        },
        {
          database: databaseIndicator,
          redis: redisIndicator,
          broker,
        },
      );

      expect(health.liveness().status).toBe('up');
      const readiness = await health.readiness();
      expect(readiness.indicators.map((item) => item.name).sort()).toEqual([
        'broker',
        'custom',
        'database',
        'redis',
      ]);
      expect(readiness.status).toBe('down');
    });

    it('respects include* flags and skips missing optional deps', async () => {
      const health = new FoundationHealthService(
        {
          database: {},
          redis: {},
          messaging: {},
          health: {
            includeDatabase: false,
            includeRedis: false,
            includeBroker: false,
          },
        },
        {},
      );
      const readiness = await health.readiness();
      expect(readiness.indicators).toEqual([]);
      expect(readiness.status).toBe('up');
    });

    it('DatabaseApiHealthIndicator and BrokerHealthIndicator cover fallbacks', async () => {
      const { DatabaseApiHealthIndicator } = await import('../../health');
      const adapter = new DatabaseApiHealthIndicator({
        check: jest.fn().mockResolvedValue({
          database: { status: 'up', latencyMs: 4 },
        }),
      });
      expect(await adapter.check()).toEqual({
        name: 'database',
        status: 'up',
        durationMs: 4,
      });

      const withFn = new BrokerHealthIndicator(
        { publish: jest.fn(), subscribe: jest.fn() },
        async () => ({ name: 'broker', status: 'up' }),
      );
      expect(await withFn.check()).toEqual({ name: 'broker', status: 'up' });

      const withLatency = new BrokerHealthIndicator({
        publish: jest.fn(),
        subscribe: jest.fn(),
        healthCheck: async () => ({ status: 'up', latencyMs: 1 }),
      });
      expect(await withLatency.check()).toEqual({
        name: 'broker',
        status: 'up',
        durationMs: 1,
      });

      const withHealth = new BrokerHealthIndicator({
        publish: jest.fn(),
        subscribe: jest.fn(),
        healthCheck: async () => ({
          status: 'down',
          error: 'unreachable',
        }),
      });
      expect(await withHealth.check()).toEqual({
        name: 'broker',
        status: 'down',
        message: 'unreachable',
      });

      const plain = new BrokerHealthIndicator({
        publish: jest.fn(),
        subscribe: jest.fn(),
      });
      expect(await plain.check()).toEqual({ name: 'broker', status: 'up' });
    });
  });

  describe('shutdown hooks', () => {
    it('registers resource and custom hooks when reliability is enabled', async () => {
      const hooks = new Map<string, () => Promise<void> | void>();
      const register = jest.fn(
        (name: string, hook: () => Promise<void> | void) => {
          hooks.set(name, hook);
          return (): void => undefined;
        },
      );
      const shutdown = { register } as unknown as GracefulShutdownService;
      const database = { disconnect: jest.fn().mockResolvedValue(undefined) };
      const redis = {
        disconnect: jest.fn().mockResolvedValue(undefined),
      } as unknown as RedisClientService;
      const broker = {
        disconnect: jest.fn().mockResolvedValue(undefined),
        publish: jest.fn(),
        subscribe: jest.fn(),
      };
      const custom = jest.fn();

      const registrar = new FoundationShutdownRegistrar(
        {
          reliability: { enableHa: false },
          shutdown: {
            hooks: [
              { name: 'custom', hook: custom },
              { name: 'ordered', hook: jest.fn(), order: 5 },
            ],
          },
        },
        shutdown,
        {
          database,
          redis,
          broker,
        },
      );
      registrar.onModuleInit();
      expect(register).toHaveBeenCalledWith(
        'foundation.database',
        expect.any(Function),
        100,
      );
      expect(register).toHaveBeenCalledWith(
        'foundation.redis',
        expect.any(Function),
        110,
      );
      expect(register).toHaveBeenCalledWith(
        'foundation.broker',
        expect.any(Function),
        120,
      );
      expect(register).toHaveBeenCalledWith('custom', custom, 200);
      expect(register).toHaveBeenCalledWith('ordered', expect.any(Function), 5);

      await hooks.get('foundation.database')?.();
      await hooks.get('foundation.redis')?.();
      await hooks.get('foundation.broker')?.();
      expect(database.disconnect).toHaveBeenCalled();
      expect(redis.disconnect).toHaveBeenCalled();
      expect(broker.disconnect).toHaveBeenCalled();

      const partial = new FoundationShutdownRegistrar(
        { reliability: {} },
        shutdown,
        {
          database: { notDisconnect: true } as never,
          broker: { publish: jest.fn(), subscribe: jest.fn() } as never,
        },
      );
      register.mockClear();
      partial.onModuleInit();
      expect(register).not.toHaveBeenCalledWith(
        'foundation.database',
        expect.any(Function),
        100,
      );
      expect(register).not.toHaveBeenCalledWith(
        'foundation.broker',
        expect.any(Function),
        120,
      );
    });

    it('skips resource hooks when disabled or reliability absent', () => {
      const register = jest.fn();
      const shutdown = { register } as unknown as GracefulShutdownService;
      const registrar = new FoundationShutdownRegistrar(
        {
          reliability: {},
          shutdown: { registerResourceHooks: false },
        },
        shutdown,
        { database: { disconnect: jest.fn() } },
      );
      registrar.onModuleInit();
      expect(register).not.toHaveBeenCalled();
    });
  });

  describe('exports', () => {
    it('re-exports foundation symbols from the infrastructure barrel', async () => {
      const barrel = await import('../..');
      expect(barrel.FoundationModule).toBe(FoundationModule);
      expect(barrel.FOUNDATION_PIPELINE_ORDER).toEqual(
        FOUNDATION_PIPELINE_ORDER,
      );
      expect(barrel.FOUNDATION_OPTIONS).toBe(FOUNDATION_OPTIONS);
    });

    it('builds health sources and shutdown targets for optional deps', () => {
      expect(buildHealthSources()).toEqual({});
      expect(
        buildHealthSources(
          { check: jest.fn() } as never,
          { check: jest.fn() } as never,
          { publish: jest.fn(), subscribe: jest.fn() },
        ),
      ).toEqual({
        database: expect.any(Object),
        redis: expect.any(Object),
        broker: expect.any(Object),
      });
      expect(buildShutdownTargets()).toEqual({});
      expect(
        buildShutdownTargets(
          { disconnect: jest.fn() },
          { disconnect: jest.fn() } as never,
          { disconnect: jest.fn() },
        ),
      ).toEqual({
        database: expect.any(Object),
        redis: expect.any(Object),
        broker: expect.any(Object),
      });
    });
  });
});
