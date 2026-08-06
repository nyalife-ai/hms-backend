import { HealthService } from '../../../platform/api/health/health.service';
import type { HealthIndicator } from '../../../platform/api/health/health-indicator.interface';
import type { HealthReport } from '../../../platform/api/health/health.types';
import {
  DatabaseApiHealthIndicator,
  RedisApiHealthIndicator,
} from '../../health/platform-health.adapters';
import type { DatabaseHealthIndicator } from '../../database/health/database-health.indicator';
import type { RedisHealthIndicator } from '../../redis/redis.health.indicator';
import {
  BrokerHealthIndicator,
  type BrokerHealthCheckable,
} from './health-adapters';
import type {
  FoundationHealthOptions,
  FoundationModuleOptions,
} from '../foundation.options';

export const FOUNDATION_HEALTH_SOURCES = Symbol('FOUNDATION_HEALTH_SOURCES');

export type FoundationHealthSources = Readonly<{
  readonly database?: DatabaseHealthIndicator;
  readonly redis?: RedisHealthIndicator;
  readonly broker?: BrokerHealthCheckable;
}>;

/**
 * Composes liveness/readiness from enabled DB / Redis / broker indicators
 * plus any extra indicators supplied in options.
 *
 * Constructed via FoundationModule factory providers (no Nest param decorators).
 */
export class FoundationHealthService {
  private readonly service: HealthService;

  public constructor(
    private readonly options: FoundationModuleOptions,
    private readonly sources: FoundationHealthSources,
  ) {
    const configuredTimeout = options.health
      ? options.health.timeoutMilliseconds
      : undefined;
    this.service = new HealthService(
      this.resolveIndicators(),
      configuredTimeout === undefined ? 1_000 : configuredTimeout,
    );
  }

  public liveness(): HealthReport {
    return this.service.liveness();
  }

  public readiness(): Promise<HealthReport> {
    return this.service.readiness();
  }

  private resolveIndicators(): readonly HealthIndicator[] {
    const health: FoundationHealthOptions = this.options.health ?? {};
    const indicators: HealthIndicator[] = [...(health.indicators ?? [])];

    if (
      health.includeDatabase !== false &&
      this.sources.database !== undefined &&
      this.isEnabled(this.options.database)
    ) {
      indicators.push(new DatabaseApiHealthIndicator(this.sources.database));
    }
    if (
      health.includeRedis !== false &&
      this.sources.redis !== undefined &&
      this.isEnabled(this.options.redis)
    ) {
      indicators.push(new RedisApiHealthIndicator(this.sources.redis));
    }
    if (
      health.includeBroker !== false &&
      this.sources.broker !== undefined &&
      this.isEnabled(this.options.messaging)
    ) {
      indicators.push(new BrokerHealthIndicator(this.sources.broker));
    }
    return indicators;
  }

  private isEnabled(value: unknown): boolean {
    return value !== undefined && value !== false;
  }
}
