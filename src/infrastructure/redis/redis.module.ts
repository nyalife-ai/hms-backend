import { DynamicModule, Module, type Provider } from '@nestjs/common';
import { REDIS_CLIENT } from '../../platform/architecture/tokens/injection.tokens';
import type {
  RedisConnectionOptions,
  RedisDriver,
  RedisSleeper,
  RedisTimer,
} from './redis.types';
import { RedisClientService } from './redis-client.service';
import { RedisConnectionFactory } from './redis-connection.factory';
import { RedisHealthIndicator } from './redis.health.indicator';

export interface RedisModuleOptions extends RedisConnectionOptions {
  readonly driver?: RedisDriver;
  readonly factory?: RedisConnectionFactory;
  readonly sleeper?: RedisSleeper;
  readonly timer?: RedisTimer;
}

@Module({})
export class RedisInfrastructureModule {
  public static register(options: RedisModuleOptions = {}): DynamicModule {
    const provider: Provider = {
      provide: RedisClientService,
      useFactory: (): RedisClientService => {
        const driver =
          options.driver ??
          (options.factory ?? new RedisConnectionFactory()).create(options)
            .client;
        return new RedisClientService(
          driver,
          options,
          options.sleeper,
          options.timer,
        );
      },
    };
    return {
      module: RedisInfrastructureModule,
      providers: [
        provider,
        { provide: REDIS_CLIENT, useExisting: RedisClientService },
        RedisHealthIndicator,
      ],
      exports: [REDIS_CLIENT, RedisClientService, RedisHealthIndicator],
    };
  }
}
