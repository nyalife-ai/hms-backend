import type {
  HealthIndicator,
  HealthIndicatorResult,
} from '../../platform/api';
import { RedisClientService } from './redis-client.service';

export class RedisHealthIndicator implements HealthIndicator {
  public readonly name = 'redis';

  public constructor(
    private readonly client: RedisClientService,
    private readonly timeoutMs = 2_000,
  ) {}

  public async check(): Promise<HealthIndicatorResult> {
    const health = await this.client.withTimeout(
      this.client.healthCheck(),
      this.timeoutMs,
    );
    return {
      name: this.name,
      status: health.status,
      durationMs: health.latencyMs,
      ...(health.error === undefined ? {} : { message: health.error }),
    };
  }
}
