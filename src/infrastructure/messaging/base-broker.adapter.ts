import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type {
  BrokerMessage,
  LifecycleMessageBroker,
  MessageHandler,
  Unsubscribe,
} from '../../platform/messaging/brokers/message-broker.interface';
import type {
  BrokerAdapterOptions,
  BrokerDriver,
  BrokerLogger,
  DriverDelivery,
} from './broker.types';

const silentLogger: BrokerLogger = { error: (): void => undefined };

export abstract class BaseBrokerAdapter
  implements LifecycleMessageBroker, OnModuleInit, OnModuleDestroy
{
  private readonly subscriptions = new Map<
    number,
    {
      readonly topic: string;
      readonly handler: MessageHandler<unknown>;
      unsubscribe: Unsubscribe;
    }
  >();
  private sequence = 0;
  private connected = false;
  private recovery?: Unsubscribe;

  protected constructor(
    protected readonly driver: BrokerDriver,
    protected readonly options: BrokerAdapterOptions,
    private readonly logger: BrokerLogger = silentLogger,
  ) {}

  public onModuleInit(): Promise<void> {
    return this.connect();
  }

  public onModuleDestroy(): Promise<void> {
    return this.disconnect();
  }

  public async connect(): Promise<void> {
    if (this.connected) return;
    await this.driver.connect();
    this.connected = true;
    this.recovery = this.driver.onDisconnect?.(() => {
      void this.recover();
    });
  }

  public async disconnect(): Promise<void> {
    if (!this.connected) return;
    this.recovery?.();
    for (const subscription of this.subscriptions.values())
      subscription.unsubscribe();
    this.subscriptions.clear();
    await this.driver.disconnect();
    this.connected = false;
  }

  public publish<T>(topic: string, payload: T): Promise<string> {
    return this.driver.publish(topic, payload, 0);
  }

  public subscribe<T>(topic: string, handler: MessageHandler<T>): Unsubscribe {
    const id = ++this.sequence;
    const erased = handler as MessageHandler<unknown>;
    const record = {
      topic,
      handler: erased,
      unsubscribe: this.attach(topic, erased),
    };
    this.subscriptions.set(id, record);
    return (): void => {
      record.unsubscribe();
      this.subscriptions.delete(id);
    };
  }

  private attach(topic: string, handler: MessageHandler<unknown>): Unsubscribe {
    return this.driver.subscribe(topic, async (delivery) => {
      await this.dispatch(delivery, handler);
    });
  }

  private async dispatch(
    delivery: DriverDelivery,
    handler: MessageHandler<unknown>,
  ): Promise<void> {
    let settled = false;
    const attempt = delivery.attempt ?? 0;
    const message: BrokerMessage<unknown> = {
      id: delivery.id,
      topic: delivery.topic,
      payload: delivery.payload,
      attempt,
      ack: async (): Promise<void> => {
        if (settled) return;
        settled = true;
        await delivery.ack();
      },
      nack: async (retry = true): Promise<void> => {
        if (settled) return;
        settled = true;
        await this.reject(delivery, attempt, retry);
      },
    };
    try {
      await this.runHandler(handler, message);
      await message.ack();
    } catch (error: unknown) {
      this.logger.error(`Broker handler failed: ${this.safeError(error)}`);
      await message.nack(true);
    }
  }

  private async runHandler(
    handler: MessageHandler<unknown>,
    message: BrokerMessage<unknown>,
  ): Promise<void> {
    if (this.options.ackTimeoutMs === undefined) {
      await handler(message);
      return;
    }
    let rejectTimeout!: (error: Error) => void;
    const timeout = new Promise<never>((_, reject) => {
      rejectTimeout = reject;
    });
    const handle = setTimeout(
      () => rejectTimeout(new Error('Broker acknowledgement timed out')),
      this.options.ackTimeoutMs,
    );
    try {
      await Promise.race([handler(message), timeout]);
    } finally {
      clearTimeout(handle);
    }
  }

  private async reject(
    delivery: DriverDelivery,
    attempt: number,
    retry: boolean,
  ): Promise<void> {
    await delivery.nack(false);
    if (!retry) return;
    const nextAttempt = attempt + 1;
    if (nextAttempt <= (this.options.maxRetries ?? 3)) {
      await this.driver.publish(delivery.topic, delivery.payload, nextAttempt);
      return;
    }
    await this.driver.publish(
      this.options.deadLetterTopic ?? `${delivery.topic}.dead-letter`,
      delivery.payload,
      nextAttempt,
    );
  }

  protected async recover(): Promise<void> {
    this.connected = false;
    try {
      await this.connect();
      for (const subscription of this.subscriptions.values()) {
        subscription.unsubscribe();
        subscription.unsubscribe = this.attach(
          subscription.topic,
          subscription.handler,
        );
      }
    } catch (error: unknown) {
      this.logger.error(`Broker recovery failed: ${this.safeError(error)}`);
    }
  }

  private safeError(error: unknown): string {
    return (error instanceof Error ? error.message : String(error)).replace(
      /([a-z]+:\/\/[^:\s/]+:)([^@\s]+)(@)/giu,
      '$1***$3',
    );
  }
}
