import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IHealthIndicator,
  HealthIndicatorResult,
} from '../interfaces/health-check.interface';

/**
 * Narrow database ping port — satisfied by TypeORM DataSource.query
 * or a Prisma-compatible raw query adapter without importing ORMs here.
 */
export interface DatabasePingClient {
  query(sql: string): Promise<unknown>;
}

export const DATABASE_PING_CLIENT = Symbol('DATABASE_PING_CLIENT');

@Injectable()
export class DatabaseHealthIndicator implements IHealthIndicator {
  public readonly name = 'database';

  public constructor(
    private readonly configService: ConfigService,
    @Optional()
    @Inject(DATABASE_PING_CLIENT)
    private readonly client?: DatabasePingClient,
  ) {}

  public async check(): Promise<HealthIndicatorResult> {
    const start = Date.now();
    if (!this.client) {
      const orm =
        this.configService.get<string>('orm.type') ??
        process.env.ORM_PROVIDER ??
        process.env.ORM_TYPE ??
        'unknown';
      return {
        status: 'down',
        message: `Database ping client is not registered (orm=${orm})`,
      };
    }

    try {
      await this.client.query('SELECT 1');
      return { status: 'up', latency: Date.now() - start };
    } catch (error: unknown) {
      return {
        status: 'down',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
