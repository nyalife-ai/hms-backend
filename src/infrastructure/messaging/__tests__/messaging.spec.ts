import type { DynamicModule, Provider } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MESSAGE_BROKER } from '../../../platform/messaging/messaging.module';
import type { MessageHandler } from '../../../platform/messaging/brokers/message-broker.interface';
import {
  loadDriver,
  MissingDriverError,
  tryLoadDriver,
} from '../../optional-driver';
import type {
  BrokerDriver,
  DriverDelivery,
  DriverDeliveryHandler,
} from '../broker.types';
import { KafkaAdapter } from '../kafka/kafka.adapter';
import {
  createKafkaBrokerDriver,
  KafkaSdkDriver,
  loadKafkaDriver,
  resolveKafkaBrokers,
  type KafkaJsEachMessagePayload,
  type KafkaJsModule,
} from '../kafka/kafka-driver.factory';
import { MessagingInfrastructureModule } from '../messaging.infrastructure.module';
import { NatsAdapter } from '../nats/nats.adapter';
import {
  createNatsBrokerDriver,
  loadNatsDriver,
  NatsSdkDriver,
  type NatsModule,
  type NatsMsg,
} from '../nats/nats-driver.factory';
import { RabbitMqAdapter } from '../rabbitmq/rabbitmq.adapter';
import {
  createRabbitMqBrokerDriver,
  loadRabbitMqDriver,
  RabbitMqSdkDriver,
  type AmqpLibModule,
  type AmqpMessage,
} from '../rabbitmq/rabbitmq-driver.factory';
import { RedisStreamsAdapter } from '../redis-streams/redis-streams.adapter';
import type { RedisDriver } from '../../redis';

class FakeBrokerDriver implements BrokerDriver {
  public readonly handlers = new Map<string, Set<DriverDeliveryHandler>>();
  public readonly published: Array<{
    topic: string;
    payload: unknown;
    attempt: number;
  }> = [];
  public readonly connect = jest.fn(async () => undefined);
  public readonly disconnect = jest.fn(async () => undefined);
  private disconnectHandler?: () => void;

  public async publish(
    topic: string,
    payload: unknown,
    attempt = 0,
  ): Promise<string> {
    this.published.push({ topic, payload, attempt });
    return `${this.published.length}`;
  }

  public subscribe(topic: string, handler: DriverDeliveryHandler): () => void {
    const handlers = this.handlers.get(topic) ?? new Set();
    handlers.add(handler);
    this.handlers.set(topic, handlers);
    return (): void => {
      handlers.delete(handler);
    };
  }

  public onDisconnect(handler: () => void): () => void {
    this.disconnectHandler = handler;
    return (): void => {
      this.disconnectHandler = undefined;
    };
  }

  public fail(): void {
    this.disconnectHandler?.();
  }

  public async emit(
    topic: string,
    payload: unknown,
    attempt = 0,
  ): Promise<{ ack: jest.Mock; nack: jest.Mock }> {
    const ack = jest.fn(async () => undefined);
    const nack = jest.fn(async () => undefined);
    const delivery: DriverDelivery = {
      id: 'message',
      topic,
      payload,
      attempt,
      ack,
      nack,
    };
    await Promise.all(
      [...(this.handlers.get(topic) ?? [])].map((handler) => handler(delivery)),
    );
    return { ack, nack };
  }
}

describe.each([
  ['Kafka', KafkaAdapter],
  ['RabbitMQ', RabbitMqAdapter],
  ['NATS', NatsAdapter],
] as const)('%s adapter', (_name, Adapter) => {
  it('connects, publishes concurrently, subscribes, acknowledges and disconnects', async () => {
    const driver = new FakeBrokerDriver();
    const adapter = new Adapter(driver);
    await Promise.all([adapter.connect(), adapter.connect()]);
    await adapter.connect();
    await Promise.all([
      adapter.publish('topic', 1),
      adapter.publish('topic', 2),
    ]);
    const received: unknown[] = [];
    const unsubscribe = adapter.subscribe('topic', async (message) => {
      received.push(message.payload);
      await message.ack();
      await message.ack();
    });
    const settled = await driver.emit('topic', { value: 1 });
    expect(received).toEqual([{ value: 1 }]);
    expect(settled.ack).toHaveBeenCalledTimes(1);
    unsubscribe();
    await adapter.disconnect();
    await adapter.disconnect();
  });
});

describe('broker shared semantics', () => {
  it('connects and disconnects through Nest module lifecycle', async () => {
    const driver = new FakeBrokerDriver();
    const module = await Test.createTestingModule({
      imports: [
        MessagingInfrastructureModule.register({
          broker: 'kafka',
          driver,
        }),
      ],
    }).compile();

    await module.init();
    expect(driver.connect).toHaveBeenCalledTimes(1);
    await module.close();
    expect(driver.disconnect).toHaveBeenCalledTimes(1);
  });

  it('redelivers nacks and routes exhausted messages to dead letter', async () => {
    const driver = new FakeBrokerDriver();
    const adapter = new KafkaAdapter(driver, {
      maxRetries: 1,
      deadLetterTopic: 'dead',
    });
    adapter.subscribe('topic', async (message) => {
      await message.nack();
    });
    const first = await driver.emit('topic', 'value', 0);
    const exhausted = await driver.emit('topic', 'value', 1);
    expect(first.nack).toHaveBeenCalledWith(false);
    expect(exhausted.nack).toHaveBeenCalledWith(false);
    expect(driver.published).toEqual([
      { topic: 'topic', payload: 'value', attempt: 1 },
      { topic: 'dead', payload: 'value', attempt: 2 },
    ]);
  });

  it('supports non-retry nacks, default dead letters, and absent attempts', async () => {
    const driver = new FakeBrokerDriver();
    const adapter = new NatsAdapter(driver, { maxRetries: 0 });
    let calls = 0;
    adapter.subscribe('topic', async (message) => {
      calls += 1;
      await message.nack(calls !== 1);
      await message.nack();
    });
    const noRetry = await driver.emit('topic', 'one');
    await driver.emit('topic', 'two');
    expect(noRetry.nack).toHaveBeenCalled();
    expect(driver.published).toEqual([
      { topic: 'topic.dead-letter', payload: 'two', attempt: 1 },
    ]);

    const noRecoveryDriver: BrokerDriver = {
      connect: async () => undefined,
      disconnect: async () => undefined,
      publish: async () => 'id',
      subscribe: (_topic, deliveryHandler) => {
        void deliveryHandler({
          id: 'id',
          topic: 'raw',
          payload: 'raw',
          ack: async () => undefined,
          nack: async () => undefined,
        });
        return (): void => undefined;
      },
    };
    const defaultAdapter = new KafkaAdapter(noRecoveryDriver);
    defaultAdapter.subscribe('raw', async () => undefined);
    await defaultAdapter.connect();
    await defaultAdapter.disconnect();
  });

  it('isolates handler errors and masks credentials in logs', async () => {
    const driver = new FakeBrokerDriver();
    const logger = { error: jest.fn() };
    const adapter = new RabbitMqAdapter(driver, { maxRetries: 0 }, logger);
    adapter.subscribe('topic', async () => {
      throw new Error('amqp://user:secret@host failed');
    });
    await driver.emit('topic', 'value');
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('amqp://user:***@host'),
    );

    const defaultDriver = new FakeBrokerDriver();
    const defaultAdapter = new KafkaAdapter(defaultDriver);
    defaultAdapter.subscribe('topic', async () => {
      throw 'non-error';
    });
    await defaultDriver.emit('topic', 'value');
  });

  it('times out handlers', async () => {
    jest.useFakeTimers();
    const driver = new FakeBrokerDriver();
    const adapter = new KafkaAdapter(driver, {
      maxRetries: 0,
      ackTimeoutMs: 10,
    });
    adapter.subscribe('topic', async () => new Promise(() => undefined));
    const emitted = driver.emit('topic', 'value');
    await jest.advanceTimersByTimeAsync(10);
    await emitted;
    expect(driver.published[0].topic).toBe('topic.dead-letter');
    jest.useRealTimers();
  });

  it('recovers and resubscribes, isolating recovery failures', async () => {
    const driver = new FakeBrokerDriver();
    const logger = { error: jest.fn() };
    const adapter = new KafkaAdapter(driver, {}, logger);
    await adapter.connect();
    const handler: MessageHandler<string> = jest.fn(async () => undefined);
    adapter.subscribe('topic', handler);
    driver.fail();
    await Promise.resolve();
    await Promise.resolve();
    await driver.emit('topic', 'after');
    expect(handler).toHaveBeenCalledTimes(1);

    driver.connect.mockRejectedValueOnce(new Error('kafka://u:password@host'));
    driver.fail();
    await Promise.resolve();
    await Promise.resolve();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('kafka://u:***@host'),
    );
  });

  it('propagates initial connection failure', async () => {
    const driver = new FakeBrokerDriver();
    driver.connect.mockRejectedValueOnce(new Error('down'));
    await expect(new KafkaAdapter(driver).connect()).rejects.toThrow('down');
  });
});

describe('driver factories and module', () => {
  const missing = (): never => {
    throw new Error('missing');
  };

  it('loads optional drivers and gives yarn hints when absent', () => {
    const value = {};
    expect(loadDriver('driver', () => value)).toBe(value);
    expect(tryLoadDriver('driver', () => value)).toBe(value);
    expect(tryLoadDriver('driver', missing)).toBeUndefined();
    expect(loadDriver<typeof import('node:path')>('node:path')).toHaveProperty(
      'join',
    );
    expect(
      tryLoadDriver<typeof import('node:path')>('node:path'),
    ).toHaveProperty('join');
    expect(new MissingDriverError('driver').cause).toBeUndefined();
    for (const [load, packageName] of [
      [loadKafkaDriver, 'kafkajs'],
      [loadRabbitMqDriver, 'amqplib'],
      [loadNatsDriver, 'nats'],
    ] as const) {
      expect(() => load(missing)).toThrow(MissingDriverError);
      try {
        load(missing);
      } catch (error: unknown) {
        expect((error as MissingDriverError).message).toContain(
          `yarn add ${packageName}`,
        );
        expect((error as MissingDriverError).cause).toBeInstanceOf(Error);
      }
      expect(load(() => value)).toBe(value);
    }
  });

  it('create*BrokerDriver throws MissingDriverError when packages are absent', () => {
    expect(() => createKafkaBrokerDriver({}, missing)).toThrow(
      MissingDriverError,
    );
    expect(() => createRabbitMqBrokerDriver({}, missing)).toThrow(
      MissingDriverError,
    );
    expect(() => createNatsBrokerDriver({}, missing)).toThrow(
      MissingDriverError,
    );
  });

  it('selects each broker and rejects invalid configuration', () => {
    const driver = new FakeBrokerDriver();
    expect(
      MessagingInfrastructureModule.createBroker('kafka', { driver }),
    ).toBeInstanceOf(KafkaAdapter);
    expect(
      MessagingInfrastructureModule.createBroker('rabbitmq', { driver }),
    ).toBeInstanceOf(RabbitMqAdapter);
    expect(
      MessagingInfrastructureModule.createBroker('nats', { driver }),
    ).toBeInstanceOf(NatsAdapter);
    expect(
      MessagingInfrastructureModule.createBroker('redis-streams', {
        redis: redisDriver(),
        redisStreams: { group: 'group' },
      }),
    ).toBeInstanceOf(RedisStreamsAdapter);
    expect(() =>
      MessagingInfrastructureModule.createBroker('invalid', {}),
    ).toThrow('Invalid MESSAGE_BROKER');
    expect(() =>
      MessagingInfrastructureModule.createBroker('redis-streams', {}),
    ).toThrow('requires a Redis driver');

    const module: DynamicModule = MessagingInfrastructureModule.register({
      broker: 'kafka',
      driver,
    });
    const provider = (module.providers as Provider[])[0] as {
      provide: symbol;
      useFactory: () => unknown;
    };
    expect(provider.provide).toBe(MESSAGE_BROKER);
    expect(provider.useFactory()).toBeInstanceOf(KafkaAdapter);

    expect(
      MessagingInfrastructureModule.createBroker('kafka', {
        resolver: () => fakeKafkaModule(),
      }),
    ).toBeInstanceOf(KafkaAdapter);
    expect(
      MessagingInfrastructureModule.createBroker('rabbitmq', {
        resolver: () => fakeAmqpModule(),
      }),
    ).toBeInstanceOf(RabbitMqAdapter);
    expect(
      MessagingInfrastructureModule.createBroker('nats', {
        resolver: () => fakeNatsModule(),
      }),
    ).toBeInstanceOf(NatsAdapter);

    const previous = process.env.MESSAGE_BROKER;
    process.env.MESSAGE_BROKER = 'kafka';
    expect(
      (
        (
          MessagingInfrastructureModule.register({ driver })
            .providers as Provider[]
        )[0] as {
          useFactory: () => unknown;
        }
      ).useFactory(),
    ).toBeInstanceOf(KafkaAdapter);
    if (previous === undefined) delete process.env.MESSAGE_BROKER;
    else process.env.MESSAGE_BROKER = previous;

    delete process.env.MESSAGE_BROKER;
    const defaultModule = MessagingInfrastructureModule.register();
    const defaultProvider = (defaultModule.providers as Provider[])[0] as {
      useFactory: () => unknown;
    };
    expect(defaultProvider.useFactory).toThrow('requires a Redis driver');
    if (previous !== undefined) process.env.MESSAGE_BROKER = previous;
  });
});

describe('KafkaSdkDriver', () => {
  it('connects, publishes, subscribes, acks, nacks and disconnects', async () => {
    const fake = fakeKafkaModule();
    const driver = new KafkaSdkDriver(fake.module, {
      brokers: ['broker:9092'],
      clientId: 'test',
      groupId: 'group',
    });
    await driver.connect();
    expect(fake.producer.connect).toHaveBeenCalled();
    expect(fake.consumer.connect).toHaveBeenCalled();

    const id = await driver.publish('topic', { ok: true }, 1);
    expect(id).toContain('topic:');
    expect(fake.producer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'topic',
        messages: [
          expect.objectContaining({
            value: JSON.stringify({ payload: { ok: true }, attempt: 1 }),
          }),
        ],
      }),
    );

    const received: DriverDelivery[] = [];
    const stopDisconnect = driver.onDisconnect(() => undefined);
    const unsubscribe = driver.subscribe('topic', async (message) => {
      received.push(message);
      await message.ack();
    });
    await Promise.resolve();
    await fake.emit({
      topic: 'topic',
      partition: 0,
      message: {
        offset: '7',
        key: null,
        value: Buffer.from(
          JSON.stringify({ payload: { ok: true }, attempt: 2 }),
        ),
      },
    });
    expect(received).toHaveLength(1);
    expect(received[0].attempt).toBe(2);
    expect(fake.consumer.commitOffsets).toHaveBeenCalledWith([
      { topic: 'topic', partition: 0, offset: '8' },
    ]);

    const nackRetry = driver.subscribe('other', async (message) => {
      await message.nack(true);
    });
    await fake.emit({
      topic: 'other',
      partition: 1,
      message: { offset: '1', key: null, value: 'plain' },
    });
    expect(fake.consumer.seek).toHaveBeenCalledWith({
      topic: 'other',
      partition: 1,
      offset: '1',
    });
    nackRetry();

    const nackDrop = driver.subscribe('drop', async (message) => {
      await message.nack(false);
      await message.nack(false);
      await message.ack();
    });
    await fake.emit({
      topic: 'drop',
      partition: 0,
      message: { offset: '3', key: null, value: null },
    });
    expect(fake.consumer.commitOffsets).toHaveBeenCalledWith([
      { topic: 'drop', partition: 0, offset: '4' },
    ]);
    nackDrop();

    await fake.emit({
      topic: 'ignored',
      partition: 0,
      message: { offset: '0', key: null, value: '{' },
    });

    unsubscribe();
    stopDisconnect();
    await driver.disconnect();
    await driver.disconnect();
    expect(fake.producer.disconnect).toHaveBeenCalled();
    expect(fake.consumer.disconnect).toHaveBeenCalled();
  });

  it('createKafkaBrokerDriver uses MESSAGE_BROKER_URL and rejects when disconnected', async () => {
    const previous = process.env.MESSAGE_BROKER_URL;
    process.env.MESSAGE_BROKER_URL = 'kafka://kafka.local:9093';
    const fake = fakeKafkaModule();
    const driver = createKafkaBrokerDriver(undefined, () => fake.module);
    await driver.connect();
    expect(fake.Kafka).toHaveBeenCalledWith(
      expect.objectContaining({ brokers: ['kafka.local:9093'] }),
    );
    await driver.disconnect();
    await expect(driver.publish('t', 1)).rejects.toThrow('not connected');
    expect(() => driver.subscribe('t', async () => undefined)).toThrow(
      'not connected',
    );
    if (previous === undefined) delete process.env.MESSAGE_BROKER_URL;
    else process.env.MESSAGE_BROKER_URL = previous;

    expect(resolveKafkaBrokers({ brokers: ['a:1', 'b:2'] })).toEqual([
      'a:1',
      'b:2',
    ]);
    expect(resolveKafkaBrokers({ url: 'not a url,host:1,host:2' })).toEqual([
      'not a url',
      'host:1',
      'host:2',
    ]);
    expect(resolveKafkaBrokers({ url: 'kafka://only-host' })).toEqual([
      'only-host:9092',
    ]);
    expect(resolveKafkaBrokers({ url: 'file:///tmp/kafka' })).toEqual([
      '/tmp/kafka',
    ]);
    expect(resolveKafkaBrokers({})).toEqual(['localhost:9092']);
  });

  it('notifies disconnect handlers via consumer events', async () => {
    const fake = fakeKafkaModule();
    const driver = new KafkaSdkDriver(fake.module);
    await driver.connect();
    const onDisconnect = jest.fn();
    const stop = driver.onDisconnect(onDisconnect);
    stop();
    driver.onDisconnect(onDisconnect);
    fake.fireDisconnect();
    expect(onDisconnect).toHaveBeenCalled();
    await driver.disconnect();
  });

  it('covers envelope branches, string values and missing consumer guards', async () => {
    const fake = fakeKafkaModule({ omitEvents: true });
    const driver = new KafkaSdkDriver(fake.module);
    await driver.connect();
    driver.subscribe('t', async (message) => {
      await message.ack();
    });
    driver.subscribe('t', async () => undefined);
    await fake.emit({
      topic: 't',
      partition: 0,
      message: {
        offset: '0',
        key: 'k',
        value: JSON.stringify({ payload: 'x' }),
      },
    });
    await fake.emit({
      topic: 't',
      partition: 0,
      message: {
        offset: '1',
        key: null,
        value: JSON.stringify({ a: 1 }),
      },
    });
    driver.subscribe('retry-default', async (message) => {
      await message.nack();
    });
    await fake.emit({
      topic: 'retry-default',
      partition: 0,
      message: {
        offset: '9',
        key: null,
        value: JSON.stringify({ payload: 1, attempt: null }),
      },
    });
    expect(fake.consumer.seek).toHaveBeenCalledWith({
      topic: 'retry-default',
      partition: 0,
      offset: '9',
    });
    driver.subscribe('gone', async (message) => {
      (driver as unknown as { consumer?: unknown }).consumer = undefined;
      await message.ack();
      await message.nack(true);
    });
    await fake.emit({
      topic: 'gone',
      partition: 0,
      message: { offset: '2', key: null, value: Buffer.from('1') },
    });
    await driver.disconnect();
  });
});

describe('RabbitMqSdkDriver', () => {
  it('connects, publishes, subscribes, acks, nacks and disconnects', async () => {
    const fake = fakeAmqpModule();
    const driver = new RabbitMqSdkDriver(fake.module, {
      url: 'amqp://guest:guest@localhost',
    });
    await driver.connect();
    expect(fake.module.connect).toHaveBeenCalledWith(
      'amqp://guest:guest@localhost',
    );

    const id = await driver.publish('queue', { a: 1 }, 0);
    expect(id).toContain('queue:');
    expect(fake.channel.assertQueue).toHaveBeenCalledWith('queue', {
      durable: true,
    });
    expect(fake.channel.sendToQueue).toHaveBeenCalled();

    const acked: unknown[] = [];
    const stopDisconnect = driver.onDisconnect(() => undefined);
    stopDisconnect();
    const unsubscribe = driver.subscribe('queue', async (message) => {
      acked.push(message.payload);
      await message.ack();
      await message.ack();
    });
    await (
      driver as unknown as {
        ensureConsumer(topic: string): Promise<void>;
      }
    ).ensureConsumer('queue');
    await (
      driver as unknown as {
        ensureConsumer(topic: string): Promise<void>;
      }
    ).ensureConsumer('queue');
    await Promise.resolve();
    await fake.emit(
      'queue',
      makeAmqpMessage(
        Buffer.from(JSON.stringify({ payload: { a: 1 }, attempt: 0 })),
        { messageId: 'm1', headers: { attempt: 0 } },
      ),
    );
    expect(acked).toEqual([{ a: 1 }]);
    expect(fake.channel.ack).toHaveBeenCalled();

    driver.subscribe('retry', async (message) => {
      await message.nack(true);
    });
    await Promise.resolve();
    const retryMsg = makeAmqpMessage(Buffer.from('"raw"'), {
      headers: { attempt: 4 },
    });
    await fake.emit('retry', retryMsg);
    expect(fake.channel.nack).toHaveBeenCalledWith(retryMsg, false, true);

    driver.subscribe('drop', async (message) => {
      await message.nack(false);
    });
    await Promise.resolve();
    const dropMsg = makeAmqpMessage(Buffer.from('{'));
    await fake.emit('drop', dropMsg);
    expect(fake.channel.nack).toHaveBeenCalledWith(dropMsg, false, false);

    driver.subscribe('nack-default', async (message) => {
      await message.nack();
      await message.nack();
    });
    await Promise.resolve();
    const defaultNack = makeAmqpMessage(
      Buffer.from(JSON.stringify({ payload: 'p' })),
    );
    await fake.emit('nack-default', defaultNack);
    expect(fake.channel.nack).toHaveBeenCalledWith(defaultNack, false, true);

    driver.subscribe('envelope', async (message) => {
      expect(message.attempt).toBe(3);
      expect(message.id).toContain('envelope:');
      await message.ack();
    });
    await Promise.resolve();
    await fake.emit(
      'envelope',
      makeAmqpMessage(
        Buffer.from(JSON.stringify({ payload: true, attempt: 3 })),
        { headers: { attempt: 'nope' } },
      ),
    );

    driver.subscribe('attempt-default', async (message) => {
      expect(message.attempt).toBe(0);
      await message.ack();
    });
    await Promise.resolve();
    await fake.emit(
      'attempt-default',
      makeAmqpMessage(Buffer.from(JSON.stringify({ payload: true }))),
    );

    await fake.emit('retry', null);
    const orphan = driver.subscribe('orphan', async () => undefined);
    await Promise.resolve();
    orphan();
    await fake.emit('orphan', makeAmqpMessage(Buffer.from('x')));
    expect(fake.channel.nack).toHaveBeenCalledWith(
      expect.anything(),
      false,
      true,
    );

    (driver as unknown as { channel?: unknown }).channel = undefined;
    await fake.emit('queue', makeAmqpMessage(Buffer.from('ignored')));

    unsubscribe();
    fake.fireClose();
    (driver as unknown as { channel: typeof fake.channel }).channel =
      fake.channel;
    fake.channel.cancel.mockRejectedValueOnce(new Error('cancel'));
    fake.channel.close.mockRejectedValueOnce(new Error('close'));
    fake.connection.close.mockRejectedValueOnce(new Error('conn'));
    await driver.disconnect();
  });

  it('createRabbitMqBrokerDriver rejects operations before connect', async () => {
    const previous = process.env.MESSAGE_BROKER_URL;
    process.env.MESSAGE_BROKER_URL = 'amqp://from-env';
    const fake = fakeAmqpModule();
    const driver = createRabbitMqBrokerDriver(undefined, () => fake.module);
    await driver.connect();
    expect(fake.module.connect).toHaveBeenCalledWith('amqp://from-env');
    if (previous === undefined) delete process.env.MESSAGE_BROKER_URL;
    else process.env.MESSAGE_BROKER_URL = previous;
    await driver.disconnect();
    await expect(driver.publish('q', 1)).rejects.toThrow('not connected');
    expect(() => driver.subscribe('q', async () => undefined)).toThrow(
      'not connected',
    );
  });

  it('covers onDisconnect unsubscribe and empty-handler dispatch', async () => {
    const fake = fakeAmqpModule();
    const driver = new RabbitMqSdkDriver(fake.module);
    await driver.connect();
    const onDisconnect = jest.fn();
    const stop = driver.onDisconnect(onDisconnect);
    stop();
    driver.onDisconnect(onDisconnect);
    fake.fireClose();
    expect(onDisconnect).toHaveBeenCalled();

    const unsubscribe = driver.subscribe('empty', async () => undefined);
    await Promise.resolve();
    unsubscribe();
    await fake.emit('empty', makeAmqpMessage(Buffer.from('"x"')));
    expect(fake.channel.nack).toHaveBeenCalledWith(
      expect.anything(),
      false,
      true,
    );

    await (
      driver as unknown as {
        dispatch(topic: string, message: AmqpMessage): Promise<void>;
      }
    ).dispatch('gone', makeAmqpMessage(Buffer.from('"y"')));

    driver.subscribe('parsed', async (message) => {
      expect(message.payload).toEqual({ plain: true });
      await message.ack();
    });
    await Promise.resolve();
    await fake.emit(
      'parsed',
      makeAmqpMessage(Buffer.from(JSON.stringify({ plain: true }))),
    );

    await driver.disconnect();
    await (
      driver as unknown as {
        dispatch(topic: string, message: AmqpMessage): Promise<void>;
      }
    ).dispatch('after-disconnect', makeAmqpMessage(Buffer.from('"z"')));
  });
});

describe('NatsSdkDriver', () => {
  it('connects, publishes, subscribes, acks, nacks and disconnects', async () => {
    const fake = fakeNatsModule();
    const driver = new NatsSdkDriver(fake.module, {
      url: 'nats://127.0.0.1:4222',
    });
    await driver.connect();
    expect(fake.module.connect).toHaveBeenCalledWith({
      servers: 'nats://127.0.0.1:4222',
    });

    const id = await driver.publish('subject', { n: 1 }, 2);
    expect(id).toContain('subject:');
    expect(fake.connection.publish).toHaveBeenCalled();

    const seen: unknown[] = [];
    const stop = driver.onDisconnect(() => undefined);
    const unsubscribe = driver.subscribe('subject', async (message) => {
      seen.push(message.payload);
      await message.ack();
      await message.ack();
    });
    driver.subscribe('subject', async () => undefined);
    await fake.emit(
      'subject',
      makeNatsMsg(
        'subject',
        new TextEncoder().encode(
          JSON.stringify({ id: '1', payload: { n: 1 }, attempt: 2 }),
        ),
      ),
    );
    expect(seen).toEqual([{ n: 1 }]);

    driver.subscribe('retry', async (message) => {
      await message.nack(true);
    });
    await fake.emit(
      'retry',
      makeNatsMsg(
        'retry',
        new TextEncoder().encode(
          JSON.stringify({ payload: 'again', attempt: 0 }),
        ),
      ),
    );
    expect(fake.connection.publish).toHaveBeenCalled();

    driver.subscribe('drop', async (message) => {
      await message.nack(false);
      await message.nack(false);
    });
    await fake.emit(
      'drop',
      makeNatsMsg('drop', new TextEncoder().encode('not-json')),
    );

    await fake.emit(
      'ignored',
      makeNatsMsg('ignored', new TextEncoder().encode('{}')),
    );

    driver.subscribe('plain-object', async (message) => {
      expect(message.payload).toEqual({ foo: 1 });
      await message.ack();
    });
    await fake.emit(
      'plain-object',
      makeNatsMsg(
        'plain-object',
        new TextEncoder().encode(JSON.stringify({ foo: 1 })),
      ),
    );
    await fake.emitError('plain-object', new Error('cb'));

    const empty = driver.subscribe('empty', async () => undefined);
    empty();
    await fake.emit(
      'empty',
      makeNatsMsg('empty', new TextEncoder().encode('1')),
    );

    unsubscribe();
    stop();
    fake.fireClosed();
    await driver.disconnect();
    expect(fake.connection.close).toHaveBeenCalled();
  });

  it('createNatsBrokerDriver uses StringCodec when provided', async () => {
    const previous = process.env.MESSAGE_BROKER_URL;
    process.env.MESSAGE_BROKER_URL = 'nats://from-env:4222';
    const fake = fakeNatsModule({ withCodec: true });
    const driver = createNatsBrokerDriver(undefined, () => fake.module);
    await driver.connect();
    expect(fake.module.connect).toHaveBeenCalledWith({
      servers: 'nats://from-env:4222',
    });
    if (previous === undefined) delete process.env.MESSAGE_BROKER_URL;
    else process.env.MESSAGE_BROKER_URL = previous;
    await driver.publish('s', 'x');
    expect(fake.encode).toHaveBeenCalled();
    driver.subscribe('s', async (message) => {
      await message.ack();
    });
    await fake.emit(
      's',
      makeNatsMsg(
        's',
        new TextEncoder().encode(JSON.stringify({ payload: 1 })),
      ),
    );
    expect(fake.decode).toHaveBeenCalled();
    await driver.disconnect();
    await expect(driver.publish('s', 1)).rejects.toThrow('not connected');
    expect(() => driver.subscribe('s', async () => undefined)).toThrow(
      'not connected',
    );
  });

  it('supports closed as a function and id fallbacks', async () => {
    const fake = fakeNatsModule({ closedAsFunction: true });
    const driver = new NatsSdkDriver(fake.module);
    await driver.connect();
    const onDisconnect = jest.fn();
    driver.onDisconnect(onDisconnect);
    driver.subscribe('s', async (message) => {
      expect(message.id).toContain('s:');
      await message.nack();
    });
    await fake.emit(
      's',
      makeNatsMsg(
        's',
        new TextEncoder().encode(JSON.stringify({ payload: 1, attempt: 0 })),
      ),
    );
    fake.fireClosed();
    await Promise.resolve();
    expect(onDisconnect).toHaveBeenCalled();
    await driver.disconnect();
  });
});

function redisDriver(): RedisDriver {
  return {
    connect: jest.fn(async () => undefined),
    quit: jest.fn(async () => 'OK' as const),
    disconnect: jest.fn(),
    ping: jest.fn(async () => 'PONG'),
    on: jest.fn(function (this: RedisDriver) {
      return this;
    }),
    pipeline: jest.fn(() => ({ exec: async () => [] })),
    get: jest.fn(async () => null),
    set: jest.fn(async () => 'OK' as const),
    setex: jest.fn(async () => 'OK' as const),
    del: jest.fn(async () => 0),
    exists: jest.fn(async () => 0),
    eval: jest.fn(async () => undefined),
    scan: jest.fn(async () => ['0', []]),
    xadd: jest.fn(async () => '1-0'),
    xgroup: jest.fn(async () => 'OK'),
    xreadgroup: jest
      .fn()
      .mockResolvedValueOnce([
        ['topic', [['1-0', ['payload', '{"ok":true}', 'attempt', '0']]]],
      ])
      .mockImplementation(() => new Promise(() => undefined)),
    xack: jest.fn(async () => 1),
  };
}

describe('Redis Streams adapter', () => {
  it('uses stream commands for publish, consume, ack and leaves shared clients open', async () => {
    const redis = redisDriver();
    const adapter = new RedisStreamsAdapter(redis, {
      group: 'group',
      consumer: 'consumer',
      blockMs: 1,
    });
    await adapter.connect();
    const received = new Promise<void>((resolve) => {
      adapter.subscribe('topic', async (message) => {
        expect(message.payload).toEqual({ ok: true });
        resolve();
      });
    });
    await received;
    await expect(adapter.publish('topic', { value: 1 })).resolves.toBe('1-0');
    expect(redis.xack).toHaveBeenCalledWith('topic', 'group', '1-0');
    await adapter.disconnect();
    expect(redis.quit).not.toHaveBeenCalled();
    expect(redis.disconnect).not.toHaveBeenCalled();
  });

  it('quits owned connections and falls back on quit failure', async () => {
    const redis = redisDriver();
    (redis.quit as jest.Mock).mockRejectedValue(new Error('closed'));
    (redis.xgroup as jest.Mock).mockRejectedValue(new Error('BUSYGROUP'));
    const adapter = new RedisStreamsAdapter(redis, { ownsConnection: true });
    await adapter.connect();
    const unsubscribe = adapter.subscribe('topic', async () => undefined);
    unsubscribe();
    await Promise.resolve();
    await adapter.disconnect();
    expect(redis.disconnect).toHaveBeenCalled();
  });

  it('ownsConnection quit succeeds without fallback disconnect', async () => {
    const redis = redisDriver();
    const adapter = new RedisStreamsAdapter(redis, { ownsConnection: true });
    await adapter.connect();
    await adapter.disconnect();
    expect(redis.quit).toHaveBeenCalled();
    expect(redis.disconnect).not.toHaveBeenCalled();
  });

  it('recovers a failed stream consumer and handles sparse fields', async () => {
    const redis = redisDriver();
    (redis.xreadgroup as jest.Mock)
      .mockReset()
      .mockRejectedValueOnce(new Error('connection lost'))
      .mockResolvedValueOnce([['topic', [['2-0', ['payload', 'null']]]]])
      .mockImplementation(() => new Promise(() => undefined));
    const adapter = new RedisStreamsAdapter(redis);
    await adapter.connect();
    adapter.subscribe('topic', async () => undefined);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(redis.connect).toHaveBeenCalledTimes(2);
  });

  it('supports stream nack retry, dead-letter and empty reads', async () => {
    const redis = redisDriver();
    (redis.xreadgroup as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce([['topic', [['3-0', []]]]])
      .mockResolvedValueOnce([
        ['topic', [['4-0', ['payload', '"retry-me"', 'attempt', '1']]]],
      ])
      .mockResolvedValueOnce([
        ['topic', [['5-0', ['payload', '"dead-me"', 'attempt', '0']]]],
      ])
      .mockImplementation(() => new Promise(() => undefined));
    const adapter = new RedisStreamsAdapter(redis, {
      deadLetterTopic: 'dlq',
    });
    await adapter.connect();
    const internalDriver = (
      adapter as unknown as { readonly driver: BrokerDriver }
    ).driver;
    await internalDriver.publish('topic', 'default-attempt');

    let deadLetterDone!: () => void;
    const deadLetter = new Promise<void>((resolve) => {
      deadLetterDone = resolve;
    });
    const retryDone = new Promise<void>((resolve) => {
      internalDriver.subscribe('topic', async (message) => {
        if (message.id === '4-0') {
          await message.nack(true);
          resolve();
          return;
        }
        if (message.id === '5-0') {
          await message.nack(false);
          deadLetterDone();
          return;
        }
        await message.ack();
      });
    });
    await retryDone;
    await deadLetter;

    expect(redis.xack).toHaveBeenCalledWith('topic', 'application', '4-0');
    expect(redis.xadd).toHaveBeenCalledWith(
      'topic',
      '*',
      'payload',
      JSON.stringify('retry-me'),
      'attempt',
      '2',
    );
    expect(redis.xack).toHaveBeenCalledWith('topic', 'application', '5-0');
    expect(redis.xadd).toHaveBeenCalledWith(
      'dlq',
      '*',
      'payload',
      JSON.stringify('dead-me'),
      'attempt',
      '1',
    );
    await adapter.disconnect();
  });

  it('nack() without args defaults to retry republish', async () => {
    const redis = redisDriver();
    (redis.xreadgroup as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce([
        ['topic', [['10-0', ['payload', '"default-retry"', 'attempt', '0']]]],
      ])
      .mockImplementation(() => new Promise(() => undefined));
    const adapter = new RedisStreamsAdapter(redis);
    await adapter.connect();
    const internalDriver = (
      adapter as unknown as { readonly driver: BrokerDriver }
    ).driver;
    const done = new Promise<void>((resolve) => {
      internalDriver.subscribe('topic', async (message) => {
        await message.nack();
        resolve();
      });
    });
    await done;
    expect(redis.xadd).toHaveBeenCalledWith(
      'topic',
      '*',
      'payload',
      JSON.stringify('default-retry'),
      'attempt',
      '1',
    );
    await adapter.disconnect();
  });

  it('nack(false) without deadLetterTopic only acknowledges', async () => {
    const redis = redisDriver();
    (redis.xreadgroup as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce([
        ['topic', [['9-0', ['payload', '"x"', 'attempt', '0']]]],
      ])
      .mockImplementation(() => new Promise(() => undefined));
    const adapter = new RedisStreamsAdapter(redis);
    await adapter.connect();
    const internalDriver = (
      adapter as unknown as { readonly driver: BrokerDriver }
    ).driver;
    const done = new Promise<void>((resolve) => {
      internalDriver.subscribe('topic', async (message) => {
        const before = (redis.xadd as jest.Mock).mock.calls.length;
        await message.nack(false);
        expect((redis.xadd as jest.Mock).mock.calls.length).toBe(before);
        resolve();
      });
    });
    await done;
    expect(redis.xack).toHaveBeenCalledWith('topic', 'application', '9-0');
    await adapter.disconnect();
  });
});

function makeAmqpMessage(
  content: Buffer,
  properties: {
    readonly messageId?: string;
    readonly headers?: Readonly<Record<string, unknown>>;
  } = {},
): AmqpMessage {
  return {
    content,
    fields: { deliveryTag: 1, routingKey: 'queue' },
    properties,
  };
}

function makeNatsMsg(subject: string, data: Uint8Array): NatsMsg {
  return { subject, data };
}

function fakeKafkaModule(options: { readonly omitEvents?: boolean } = {}): {
  module: KafkaJsModule;
  Kafka: jest.Mock;
  producer: {
    connect: jest.Mock;
    disconnect: jest.Mock;
    send: jest.Mock;
  };
  consumer: {
    connect: jest.Mock;
    disconnect: jest.Mock;
    subscribe: jest.Mock;
    run: jest.Mock;
    commitOffsets: jest.Mock;
    seek: jest.Mock;
    on: jest.Mock;
    events?: { DISCONNECT: string };
  };
  emit: (payload: KafkaJsEachMessagePayload) => Promise<void>;
  fireDisconnect: () => void;
} {
  let eachMessage:
    ((payload: KafkaJsEachMessagePayload) => Promise<void>) | undefined;
  let disconnectListener: (() => void) | undefined;
  const producer = {
    connect: jest.fn(async () => undefined),
    disconnect: jest.fn(async () => undefined),
    send: jest.fn(async () => undefined),
  };
  const consumer: {
    connect: jest.Mock;
    disconnect: jest.Mock;
    subscribe: jest.Mock;
    run: jest.Mock;
    commitOffsets: jest.Mock;
    seek: jest.Mock;
    on: jest.Mock;
    events?: { DISCONNECT: string };
  } = {
    connect: jest.fn(async () => undefined),
    disconnect: jest.fn(async () => undefined),
    subscribe: jest.fn(async () => undefined),
    run: jest.fn(
      async (options: {
        eachMessage(payload: KafkaJsEachMessagePayload): Promise<void>;
      }) => {
        eachMessage = options.eachMessage;
      },
    ),
    commitOffsets: jest.fn(async () => undefined),
    seek: jest.fn(),
    on: jest.fn((_event: string, listener: () => void) => {
      disconnectListener = listener;
    }),
  };
  if (!options.omitEvents) {
    consumer.events = { DISCONNECT: 'consumer.disconnect' };
  }
  const Kafka = jest.fn(() => ({
    producer: () => producer,
    consumer: () => consumer,
  }));
  return {
    module: { Kafka },
    Kafka,
    producer,
    consumer,
    emit: async (payload) => {
      await eachMessage?.(payload);
    },
    fireDisconnect: () => disconnectListener?.(),
  };
}

function fakeAmqpModule(): {
  module: AmqpLibModule;
  connection: {
    createChannel: jest.Mock;
    close: jest.Mock;
    on: jest.Mock;
  };
  channel: {
    assertQueue: jest.Mock;
    sendToQueue: jest.Mock;
    consume: jest.Mock;
    cancel: jest.Mock;
    ack: jest.Mock;
    nack: jest.Mock;
    close: jest.Mock;
  };
  emit: (queue: string, message: AmqpMessage | null) => Promise<void>;
  fireClose: () => void;
} {
  const consumers = new Map<string, (message: AmqpMessage | null) => void>();
  let closeListener: (() => void) | undefined;
  const channel = {
    assertQueue: jest.fn(async () => undefined),
    sendToQueue: jest.fn(() => true),
    consume: jest.fn(
      async (
        queue: string,
        onMessage: (message: AmqpMessage | null) => void,
      ) => {
        consumers.set(queue, onMessage);
        return { consumerTag: `tag-${queue}` };
      },
    ),
    cancel: jest.fn(async () => undefined),
    ack: jest.fn(),
    nack: jest.fn(),
    close: jest.fn(async () => undefined),
  };
  const connection = {
    createChannel: jest.fn(async () => channel),
    close: jest.fn(async () => undefined),
    on: jest.fn((_event: string, listener: () => void) => {
      closeListener = listener;
    }),
  };
  return {
    module: {
      connect: jest.fn(async () => connection),
    },
    connection,
    channel,
    emit: async (queue, message) => {
      consumers.get(queue)?.(message);
      await Promise.resolve();
    },
    fireClose: () => closeListener?.(),
  };
}

function fakeNatsModule(
  options: {
    readonly withCodec?: boolean;
    readonly closedAsFunction?: boolean;
  } = {},
): {
  module: NatsModule;
  connection: {
    publish: jest.Mock;
    subscribe: jest.Mock;
    close: jest.Mock;
    closed: Promise<void> | (() => Promise<void>);
  };
  encode: jest.Mock;
  decode: jest.Mock;
  emit: (subject: string, message: NatsMsg) => Promise<void>;
  emitError: (subject: string, error: Error) => Promise<void>;
  fireClosed: () => void;
} {
  const callbacks = new Map<
    string,
    (error: Error | null, message: NatsMsg) => void
  >();
  let resolveClosed!: () => void;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  const encode = jest.fn((value: string) => new TextEncoder().encode(value));
  const decode = jest.fn((value: Uint8Array) =>
    new TextDecoder().decode(value),
  );
  const connection: {
    publish: jest.Mock;
    subscribe: jest.Mock;
    close: jest.Mock;
    closed: Promise<void> | (() => Promise<void>);
  } = {
    publish: jest.fn(),
    subscribe: jest.fn(
      (
        subject: string,
        opts?: {
          callback?: (error: Error | null, message: NatsMsg) => void;
        },
      ) => {
        if (opts?.callback) callbacks.set(subject, opts.callback);
        return {
          unsubscribe: jest.fn(),
        };
      },
    ),
    close: jest.fn(async () => undefined),
    closed: options.closedAsFunction ? () => closed : closed,
  };
  const module: NatsModule = {
    connect: jest.fn(async () => connection),
  };
  if (options.withCodec) {
    module.StringCodec = () => ({ encode, decode });
  }
  return {
    module,
    connection,
    encode,
    decode,
    emit: async (subject, message) => {
      callbacks.get(subject)?.(null, message);
      await Promise.resolve();
    },
    emitError: async (subject, error) => {
      callbacks.get(subject)?.(error, makeNatsMsg(subject, new Uint8Array()));
      await Promise.resolve();
    },
    fireClosed: () => resolveClosed(),
  };
}
