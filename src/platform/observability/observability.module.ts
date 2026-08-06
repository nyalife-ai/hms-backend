import {
  DynamicModule,
  type InjectionToken,
  Module,
  Provider,
} from '@nestjs/common';
import {
  allowInMemoryDefaults,
  type ProductionAwareOptions,
  resolveIsProduction,
} from '../architecture/production-defaults';
import { Clock } from '../../core';
import { ObservabilityConfig } from './configuration/observability.config';
import { resolveObservabilityConfig } from './configuration/resolve-observability-config';
import {
  ObservabilityProviderOverrides,
  resolveObservabilityProviders,
} from './configuration/resolve-observability-providers';
import { PrometheusFormatter } from './dashboard/prometheus-formatter';
import { ErrorReporter } from './error-tracking/error-reporter.interface';
import { InMemoryErrorReporter } from './error-tracking/in-memory-error-reporter';
import { StructuredLogger } from './logging/logger.interface';
import { JsonStructuredLogger, LogLevel } from './logging/structured-logger';
import { MetricsCollectorLike } from './metrics/metric.types';
import { MetricsCollector } from './metrics/metrics-collector';
import { Monitor } from './monitoring/monitor.interface';
import { MonitoringService } from './monitoring/monitoring.service';
import { Profiler as ProfilerContract } from './profiling/profiler.interface';
import { Profiler } from './profiling/profiler';
import { InMemoryTracer } from './tracing/in-memory-tracer';
import { Tracer } from './tracing/tracer.interface';

export const OBSERVABILITY_LOGGER = Symbol('OBSERVABILITY_LOGGER');
export const OBSERVABILITY_MONITOR = Symbol('OBSERVABILITY_MONITOR');
export const OBSERVABILITY_TRACER = Symbol('OBSERVABILITY_TRACER');
export const OBSERVABILITY_METRICS = Symbol('OBSERVABILITY_METRICS');
export const OBSERVABILITY_ERROR_REPORTER = Symbol(
  'OBSERVABILITY_ERROR_REPORTER',
);
export const OBSERVABILITY_PROFILER = Symbol('OBSERVABILITY_PROFILER');
export const OBSERVABILITY_CONFIG = Symbol('OBSERVABILITY_CONFIG');

export interface ObservabilityModuleOptions extends ProductionAwareOptions {
  readonly logger?: StructuredLogger;
  readonly monitor?: Monitor;
  readonly tracer?: Tracer;
  /**
   * **API note:** widened (additively, non-breaking) from `MetricsCollector`
   * to also accept {@link MetricsCollectorLike} so `forRoot`/`forRootAsync`
   * can supply Prometheus/OpenTelemetry-backed collectors, which compose a
   * `MetricsCollector` internally rather than extending it. Existing callers
   * passing a `MetricsCollector` are unaffected.
   */
  readonly metrics?: MetricsCollector | MetricsCollectorLike;
  readonly errorReporter?: ErrorReporter;
  readonly profiler?: ProfilerContract;
  readonly clock?: Clock;
  readonly minimumLogLevel?: LogLevel;
}

@Module({})
export class ObservabilityModule {
  public static register(
    options: ObservabilityModuleOptions = {},
  ): DynamicModule {
    const isProduction = resolveIsProduction(options);
    const allowInMemory = allowInMemoryDefaults(options);
    const clock: Clock = options.clock ?? {
      now: (): Date => new Date(),
      timestamp: (): number => Date.now(),
    };

    const monitor =
      options.monitor ?? (allowInMemory ? new MonitoringService() : undefined);
    const tracer =
      options.tracer ?? (allowInMemory ? new InMemoryTracer(clock) : undefined);
    const metrics =
      options.metrics ?? (allowInMemory ? new MetricsCollector() : undefined);
    const errorReporter =
      options.errorReporter ??
      (allowInMemory ? new InMemoryErrorReporter() : undefined);

    if (isProduction && !options.allowInMemory) {
      if (!options.monitor || !options.tracer || !options.errorReporter) {
        throw new Error(
          'ObservabilityModule: external monitor, tracer, and errorReporter are required in production (or set allowInMemory: true)',
        );
      }
    }
    if (!monitor || !tracer || !metrics || !errorReporter) {
      throw new Error(
        'ObservabilityModule: monitor, tracer, metrics, and errorReporter are required in production (or set allowInMemory: true)',
      );
    }

    const providers: Provider[] = [
      {
        provide: OBSERVABILITY_LOGGER,
        useValue:
          options.logger ??
          new JsonStructuredLogger(
            undefined,
            undefined,
            options.minimumLogLevel,
          ),
      },
      { provide: OBSERVABILITY_MONITOR, useValue: monitor },
      { provide: OBSERVABILITY_TRACER, useValue: tracer },
      { provide: OBSERVABILITY_METRICS, useValue: metrics },
      { provide: OBSERVABILITY_ERROR_REPORTER, useValue: errorReporter },
      {
        provide: OBSERVABILITY_PROFILER,
        useValue: options.profiler ?? new Profiler(),
      },
      PrometheusFormatter,
    ];
    return {
      module: ObservabilityModule,
      providers,
      exports: [
        OBSERVABILITY_LOGGER,
        OBSERVABILITY_MONITOR,
        OBSERVABILITY_TRACER,
        OBSERVABILITY_METRICS,
        OBSERVABILITY_ERROR_REPORTER,
        OBSERVABILITY_PROFILER,
        PrometheusFormatter,
      ],
    };
  }

  /**
   * Resolves {@link ObservabilityConfig} from env (`OBSERVABILITY_ENABLED`,
   * `OBSERVABILITY_TRACER`, `OTEL_*`, ...) and builds concrete providers via
   * `resolveObservabilityProviders`, then delegates to {@link register} —
   * which keeps applying its existing defaults/production guards for any
   * provider not covered by config (e.g. `monitor`, `profiler`).
   */
  public static forRoot(
    options: ObservabilityForRootOptions = {},
  ): DynamicModule {
    const env = options.env ?? process.env;
    const config = options.config ?? resolveObservabilityConfig(env);
    const resolved = resolveObservabilityProviders(config, options);
    const dynamicModule = ObservabilityModule.register({
      ...options,
      logger: resolved.logger,
      tracer: resolved.tracer,
      metrics: resolved.metrics,
      errorReporter: resolved.errorReporter,
    });
    return ObservabilityModule.withConfigProvider(dynamicModule, config);
  }

  /**
   * Nest async-factory variant of {@link forRoot}: resolves options (e.g.
   * from a `ConfigService`) at DI-time, then reuses `register()`/`forRoot()`
   * internally so behaviour matches the synchronous path exactly.
   */
  public static forRootAsync<TDependencies extends readonly unknown[]>(
    options: ObservabilityModuleAsyncOptions<TDependencies>,
  ): DynamicModule {
    const resolvedModuleToken = Symbol('OBSERVABILITY_RESOLVED_MODULE');
    const resolvedModuleProvider: Provider = {
      provide: resolvedModuleToken,
      useFactory: async (
        ...dependencies: TDependencies
      ): Promise<DynamicModule> => {
        const raw = await options.useFactory(...dependencies);
        return ObservabilityModule.forRoot(raw);
      },
      inject: [...(options.inject ?? [])],
    };

    const tokens: readonly InjectionToken[] = [
      OBSERVABILITY_LOGGER,
      OBSERVABILITY_MONITOR,
      OBSERVABILITY_TRACER,
      OBSERVABILITY_METRICS,
      OBSERVABILITY_ERROR_REPORTER,
      OBSERVABILITY_PROFILER,
      OBSERVABILITY_CONFIG,
    ];

    return {
      module: ObservabilityModule,
      imports: options.imports,
      providers: [
        resolvedModuleProvider,
        ...tokens.map((token): Provider => ({
          provide: token,
          useFactory: (resolvedModule: DynamicModule): unknown =>
            ObservabilityModule.providerValue(resolvedModule, token),
          inject: [resolvedModuleToken],
        })),
        PrometheusFormatter,
      ],
      exports: [...tokens, PrometheusFormatter],
    };
  }

  /** Alias for {@link forRootAsync}, matching `CacheModule.registerAsync` naming. */
  public static registerAsync<TDependencies extends readonly unknown[]>(
    options: ObservabilityModuleAsyncOptions<TDependencies>,
  ): DynamicModule {
    return ObservabilityModule.forRootAsync(options);
  }

  private static withConfigProvider(
    dynamicModule: DynamicModule,
    config: ObservabilityConfig,
  ): DynamicModule {
    return {
      ...dynamicModule,
      providers: [
        ...(dynamicModule.providers ?? []),
        { provide: OBSERVABILITY_CONFIG, useValue: config },
      ],
      exports: [...(dynamicModule.exports ?? []), OBSERVABILITY_CONFIG],
    };
  }

  private static providerValue(
    dynamicModule: DynamicModule,
    token: InjectionToken,
  ): unknown {
    const providers = dynamicModule.providers ?? [];
    const found = providers.find(
      (candidate): candidate is Provider & { readonly useValue: unknown } =>
        typeof candidate === 'object' &&
        candidate !== null &&
        'provide' in candidate &&
        candidate.provide === token &&
        'useValue' in candidate,
    );
    if (!found) {
      throw new Error(
        `ObservabilityModule: no resolved provider found for token ${String(token)}`,
      );
    }
    return found.useValue;
  }
}

export interface ObservabilityForRootOptions
  extends ObservabilityModuleOptions, ObservabilityProviderOverrides {
  readonly config?: ObservabilityConfig;
  /** Process-env style map used when `config` is omitted. */
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export interface ObservabilityModuleAsyncOptions<
  TDependencies extends readonly unknown[] = readonly unknown[],
> {
  readonly imports?: DynamicModule['imports'];
  readonly inject?: { readonly [TKey in keyof TDependencies]: InjectionToken };
  readonly useFactory: (
    ...dependencies: TDependencies
  ) => ObservabilityForRootOptions | Promise<ObservabilityForRootOptions>;
}
