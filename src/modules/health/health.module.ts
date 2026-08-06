import { Module, type Provider } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import {
  DATABASE_PING_CLIENT,
  DatabaseHealthIndicator,
  type DatabasePingClient,
} from './indicators/database.health';
import { RedisHealthIndicator } from './indicators/redis.health';
import { SystemHealthIndicator } from './indicators/system.health';

/**
 * Prefer Nest TypeORM DataSource when DatabaseModule registered TypeORM.
 * When ORM_PROVIDER=prisma, this optional injection is undefined and the
 * database indicator reports that a ping client must be registered.
 */
const typeOrmPingProvider: Provider = {
  provide: DATABASE_PING_CLIENT,
  inject: [{ token: getDataSourceToken(), optional: true }],
  useFactory: (dataSource?: DataSource): DatabasePingClient | undefined => {
    if (!dataSource) {
      return undefined;
    }
    return {
      query: (sql: string): Promise<unknown> => dataSource.query(sql),
    };
  },
};

@Module({
  imports: [ConfigModule],
  controllers: [HealthController],
  providers: [
    HealthService,
    DatabaseHealthIndicator,
    RedisHealthIndicator,
    SystemHealthIndicator,
    typeOrmPingProvider,
  ],
  exports: [HealthService],
})
export class HealthModule {}
