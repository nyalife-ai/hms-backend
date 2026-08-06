import type {
  HealthIndicator,
  HealthIndicatorResult,
} from '../../platform/api';
import type { DatabaseHealthIndicatorResult } from '../database';

export interface DatabaseHealthSource {
  check(): Promise<DatabaseHealthIndicatorResult>;
}

export interface RedisHealthSource {
  check(): Promise<HealthIndicatorResult>;
}

/** Maps the infrastructure database probe into the API health contract. */
export class DatabaseApiHealthIndicator implements HealthIndicator {
  public readonly name = 'database';

  public constructor(private readonly source: DatabaseHealthSource) {}

  public async check(): Promise<HealthIndicatorResult> {
    const { database } = await this.source.check();
    const error = database.details?.['error'];
    return {
      name: this.name,
      status: database.status,
      durationMs: database.latencyMs,
      ...(error === undefined ? {} : { message: String(error) }),
    };
  }
}

/** Gives Redis probes an explicit adapter at the platform composition edge. */
export class RedisApiHealthIndicator implements HealthIndicator {
  public readonly name = 'redis';

  public constructor(private readonly source: RedisHealthSource) {}

  public check(): Promise<HealthIndicatorResult> {
    return this.source.check();
  }
}
