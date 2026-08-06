import { DynamicModule, Module, type Provider } from '@nestjs/common';
import { MESSAGE_BROKER } from '../../platform/messaging/messaging.module';
import type { MessageBroker } from '../../platform/messaging/brokers/message-broker.interface';
import type { ModuleResolver } from '../optional-driver';
import type { RedisDriver } from '../redis';
import type {
  BrokerAdapterOptions,
  BrokerDriver,
  BrokerLogger,
} from './broker.types';
import { KafkaAdapter } from './kafka/kafka.adapter';
import {
  createKafkaBrokerDriver,
  type KafkaBrokerDriverOptions,
} from './kafka/kafka-driver.factory';
import { NatsAdapter } from './nats/nats.adapter';
import {
  createNatsBrokerDriver,
  type NatsBrokerDriverOptions,
} from './nats/nats-driver.factory';
import { RabbitMqAdapter } from './rabbitmq/rabbitmq.adapter';
import {
  createRabbitMqBrokerDriver,
  type RabbitMqBrokerDriverOptions,
} from './rabbitmq/rabbitmq-driver.factory';
import {
  RedisStreamsAdapter,
  type RedisStreamsOptions,
} from './redis-streams/redis-streams.adapter';

export type BrokerKind = 'kafka' | 'rabbitmq' | 'nats' | 'redis-streams';

export interface MessagingInfrastructureOptions extends BrokerAdapterOptions {
  readonly broker?: string;
  readonly driver?: BrokerDriver;
  readonly redis?: RedisDriver;
  readonly redisStreams?: RedisStreamsOptions;
  readonly resolver?: ModuleResolver;
  readonly logger?: BrokerLogger;
  readonly url?: string;
  readonly kafka?: KafkaBrokerDriverOptions;
  readonly rabbitmq?: RabbitMqBrokerDriverOptions;
  readonly nats?: NatsBrokerDriverOptions;
}

@Module({})
export class MessagingInfrastructureModule {
  public static register(
    options: MessagingInfrastructureOptions = {},
  ): DynamicModule {
    const broker =
      options.broker ?? process.env.MESSAGE_BROKER ?? 'redis-streams';
    const provider: Provider = {
      provide: MESSAGE_BROKER,
      useFactory: (): MessageBroker => this.createBroker(broker, options),
    };
    return {
      module: MessagingInfrastructureModule,
      providers: [provider],
      exports: [MESSAGE_BROKER],
    };
  }

  public static createBroker(
    broker: string,
    options: MessagingInfrastructureOptions,
  ): MessageBroker {
    const url = options.url ?? process.env.MESSAGE_BROKER_URL;
    switch (broker) {
      case 'kafka':
        return new KafkaAdapter(
          options.driver ??
            createKafkaBrokerDriver(
              { ...options.kafka, url: options.kafka?.url ?? url },
              options.resolver,
            ),
          options,
          options.logger,
        );
      case 'rabbitmq':
        return new RabbitMqAdapter(
          options.driver ??
            createRabbitMqBrokerDriver(
              { ...options.rabbitmq, url: options.rabbitmq?.url ?? url },
              options.resolver,
            ),
          options,
          options.logger,
        );
      case 'nats':
        return new NatsAdapter(
          options.driver ??
            createNatsBrokerDriver(
              { ...options.nats, url: options.nats?.url ?? url },
              options.resolver,
            ),
          options,
          options.logger,
        );
      case 'redis-streams':
        if (!options.redis) {
          throw new Error('Redis Streams broker requires a Redis driver');
        }
        return new RedisStreamsAdapter(
          options.redis,
          { ...options, ...options.redisStreams },
          options.logger,
        );
      default:
        throw new Error(
          `Invalid MESSAGE_BROKER "${broker}". Expected kafka, rabbitmq, nats, or redis-streams`,
        );
    }
  }
}
