import {
  Inject,
  Injectable,
  Optional,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import {
  IHealthIndicator,
  HealthIndicatorResult,
} from '../interfaces/health-check.interface';

/**
 * Redis readiness check using a dedicated short-lived ping client.
 *
 * Prefer injecting a shared Redis client from infrastructure when available;
 * this fallback keeps HealthModule usable without business queue bindings.
 */
@Injectable()
export class RedisHealthIndicator implements IHealthIndicator, OnModuleDestroy {
  public readonly name = 'redis';
  private readonly client: Redis;

  public constructor(
    private readonly configService: ConfigService,
    @Optional()
    @Inject('REDIS_PING_CLIENT')
    injectedClient?: Redis,
  ) {
    this.client =
      injectedClient ??
      new Redis({
        host: this.configService.get<string>('redis.host') ?? 'localhost',
        port: this.configService.get<number>('redis.port') ?? 6379,
        password: this.configService.get<string>('redis.password') || undefined,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
      });
  }

  public async check(): Promise<HealthIndicatorResult> {
    const start = Date.now();
    try {
      if (this.client.status === 'wait') {
        await this.client.connect();
      }
      const pong = await this.client.ping();
      if (pong !== 'PONG') {
        throw new Error(`Unexpected Redis ping response: ${String(pong)}`);
      }
      return { status: 'up', latency: Date.now() - start };
    } catch (error: unknown) {
      return {
        status: 'down',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  public async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
