import type { HealthIndicator } from '../../../platform/api/health/health-indicator.interface';
import type { HealthIndicatorResult } from '../../../platform/api/health/health.types';
import type { MessageBroker } from '../../../platform/messaging/brokers/message-broker.interface';

export type BrokerHealthCheckable = MessageBroker & {
  readonly healthCheck?: () => Promise<{
    readonly status: 'up' | 'down';
    readonly latencyMs?: number;
    readonly error?: string;
  }>;
  readonly connect?: () => Promise<void>;
};

/**
 * Readiness probe for an enabled message broker.
 * Uses `healthCheck` when present; otherwise reports up if the broker object exists.
 * Does not fabricate connectivity — callers may supply a custom check.
 */
export class BrokerHealthIndicator implements HealthIndicator {
  public readonly name = 'broker';

  public constructor(
    private readonly broker: BrokerHealthCheckable,
    private readonly checkFn?: () => Promise<HealthIndicatorResult>,
  ) {}

  public async check(): Promise<HealthIndicatorResult> {
    if (this.checkFn) {
      return this.checkFn();
    }
    if (typeof this.broker.healthCheck === 'function') {
      const health = await this.broker.healthCheck();
      return {
        name: this.name,
        status: health.status,
        ...(health.latencyMs === undefined
          ? {}
          : { durationMs: health.latencyMs }),
        ...(health.error === undefined ? {} : { message: health.error }),
      };
    }
    return { name: this.name, status: 'up' };
  }
}
