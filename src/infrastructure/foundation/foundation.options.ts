import type {
  DynamicModule,
  PipeTransform,
  Provider,
  Type,
} from '@nestjs/common';
import type { ProductionAwareOptions } from '../../platform/architecture/production-defaults';
import type { ConfigurationModuleOptions } from '../../platform/configuration/configuration.module';
import type { ObservabilityModuleOptions } from '../../platform/observability/observability.module';
import type { ReliabilityModuleOptions } from '../../platform/reliability/reliability.module';
import type { DatabaseModuleOptions } from '../../platform/database/database.module';
import type { SecurityModuleOptions } from '../../platform/security/security.module';
import type { TenancyModuleOptions } from '../../platform/tenancy/tenancy.module';
import type { ApiModuleOptions } from '../../platform/api/api.module';
import type { MessagingModuleOptions } from '../../platform/messaging/messaging.module';
import type { QueueModuleOptions } from '../../platform/queue/queue.module';
import type { HealthIndicator } from '../../platform/api/health/health-indicator.interface';
import type { GracefulShutdownOptions } from '../../platform/reliability/shutdown/graceful-shutdown.service';
import type { DatabaseInfrastructureOptions } from '../database/database.infrastructure.module';
import type { RedisModuleOptions } from '../redis/redis.module';
import type { MessagingInfrastructureOptions } from '../messaging/messaging.infrastructure.module';
import type { StorageInfrastructureOptions } from '../storage/storage.infrastructure.module';
import type { FoundationPipelineStage } from './foundation.tokens';

/** Nest import accepted by Foundation extension points. */
export type FoundationImport =
  Type<unknown> | DynamicModule | Promise<DynamicModule>;

/**
 * Capability slot: omit or `false` to disable; object enables the journey.
 * Prefer supplying `module` when wiring infrastructure DynamicModules.
 * Nested option bags are forwarded only to known platform/infra modules —
 * Foundation does not invent durable adapters.
 */
export type FoundationCapability<TOptions> =
  | false
  | (TOptions & {
      /**
       * Explicit DynamicModule / Nest module. When set, Foundation imports it
       * instead of constructing a default platform/infra module from options.
       */
      readonly module?: FoundationImport;
    });

/** Narrows optional/false capability slots to their enabled object form. */
export const isCapabilityObject = <T>(
  value: FoundationCapability<T> | undefined,
): value is T & { readonly module?: FoundationImport } =>
  value !== undefined && value !== false;

export interface FoundationDatabaseOptions {
  readonly module?: FoundationImport;
  /** Platform {@link DatabaseModule.forRoot} options. */
  readonly platform?: DatabaseModuleOptions;
  /** Infrastructure {@link DatabaseInfrastructureModule.forRoot} options. */
  readonly infrastructure?: DatabaseInfrastructureOptions;
}

export interface FoundationRedisOptions {
  readonly module?: FoundationImport;
  readonly options?: RedisModuleOptions;
}

export interface FoundationSecurityOptions {
  readonly module?: FoundationImport;
  readonly options?: SecurityModuleOptions;
}

export interface FoundationTenancyOptions {
  readonly module?: FoundationImport;
  readonly options?: TenancyModuleOptions;
}

export interface FoundationApiOptions {
  readonly module?: FoundationImport;
  readonly options?: ApiModuleOptions;
}

export interface FoundationMessagingOptions {
  readonly module?: FoundationImport;
  /** Platform messaging contracts (broker/webhooks). */
  readonly platform?: MessagingModuleOptions;
  /** Infrastructure broker drivers. */
  readonly infrastructure?: MessagingInfrastructureOptions;
}

export interface FoundationQueueOptions {
  readonly module?: FoundationImport;
  readonly options?: QueueModuleOptions;
}

export interface FoundationStorageOptions {
  readonly module?: FoundationImport;
  readonly options?: StorageInfrastructureOptions;
}

/**
 * Explicit HTTP pipeline registration. Every stage defaults to off.
 * Enabling auth/tenant/rateLimit requires the matching capability module.
 */
export interface FoundationPipelineOptions {
  /** Bind correlation interceptor (request/response header propagation). */
  readonly correlation?: boolean;
  /** Bind Nest ValidationPipe as APP_PIPE. */
  readonly validation?: boolean | PipeTransform;
  /** Bind platform AuthGuard as APP_GUARD (requires security). */
  readonly auth?: boolean;
  /** Bind TenantContextInterceptor as APP_INTERCEPTOR (requires tenancy). */
  readonly tenant?: boolean;
  /** Bind RateLimitGuard as APP_GUARD (requires security). */
  readonly rateLimit?: boolean;
  /**
   * Bind an audit interceptor as APP_INTERCEPTOR.
   * Pass `true` only when an `auditInterceptor` provider class is supplied,
   * or pass the interceptor type/provider directly.
   */
  readonly audit?: boolean | Type<unknown> | Provider;
  /** Bind tracing interceptor using OBSERVABILITY_TRACER when available. */
  readonly tracing?: boolean;
  /** Track in-flight HTTP requests for graceful drain (requires reliability). */
  readonly activeRequestTracking?: boolean;
  /** Optional override of documented stage order (must be a permutation). */
  readonly order?: readonly FoundationPipelineStage[];
}

export interface FoundationHealthOptions {
  /** Extra indicators composed into readiness. */
  readonly indicators?: readonly HealthIndicator[];
  readonly timeoutMilliseconds?: number;
  /** Include DB indicator when database capability is enabled (default true). */
  readonly includeDatabase?: boolean;
  /** Include Redis indicator when redis capability is enabled (default true). */
  readonly includeRedis?: boolean;
  /** Include broker indicator when messaging capability is enabled (default true). */
  readonly includeBroker?: boolean;
}

export interface FoundationShutdownHook {
  readonly name: string;
  readonly hook: () => Promise<void> | void;
  readonly order?: number;
}

export interface FoundationShutdownOptions extends GracefulShutdownOptions {
  /** Additional hooks registered after Nest module init. */
  readonly hooks?: readonly FoundationShutdownHook[];
  /**
   * Register disconnect hooks for enabled DB / Redis / broker when present.
   * Defaults to true when reliability is enabled.
   */
  readonly registerResourceHooks?: boolean;
}

/**
 * Options for {@link FoundationModule.register}.
 *
 * Capabilities are opt-in. Production mode fails fast when an enabled
 * capability lacks a durable/external provider (or `allowInMemory: true`).
 */
export interface FoundationModuleOptions extends ProductionAwareOptions {
  /** Mark the dynamic module global. */
  readonly global?: boolean;
  /** Platform configuration module. */
  readonly configuration?: FoundationCapability<ConfigurationModuleOptions>;
  /** Platform observability (logger/metrics/tracer/error reporter). */
  readonly observability?: FoundationCapability<ObservabilityModuleOptions>;
  /** Platform reliability (locks, drain, graceful shutdown). */
  readonly reliability?: FoundationCapability<ReliabilityModuleOptions>;
  readonly database?: FoundationCapability<FoundationDatabaseOptions>;
  readonly redis?: FoundationCapability<FoundationRedisOptions>;
  readonly security?: FoundationCapability<FoundationSecurityOptions>;
  readonly tenancy?: FoundationCapability<FoundationTenancyOptions>;
  readonly api?: FoundationCapability<FoundationApiOptions>;
  readonly messaging?: FoundationCapability<FoundationMessagingOptions>;
  readonly queue?: FoundationCapability<FoundationQueueOptions>;
  readonly storage?: FoundationCapability<FoundationStorageOptions>;
  /** Explicit HTTP pipeline stages (default: none registered). */
  readonly pipeline?: FoundationPipelineOptions;
  readonly health?: FoundationHealthOptions;
  readonly shutdown?: FoundationShutdownOptions;
  /**
   * Typed extension point for additional DynamicModules (feature-agnostic
   * providers). Do not use this to import `src/modules` business modules.
   */
  readonly imports?: readonly FoundationImport[];
  readonly providers?: readonly Provider[];
  readonly exports?: ReadonlyArray<string | symbol | Provider | Type<unknown>>;
}
