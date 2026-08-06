import { loadDriver, type ModuleResolver } from '../../optional-driver';
import type {
  BrokerDriver,
  DriverDeliveryHandler,
  DriverUnsubscribe,
} from '../broker.types';

/** Minimal amqplib surface used by {@link RabbitMqSdkDriver}. */
export interface AmqpMessage {
  readonly content: Buffer;
  readonly fields: {
    readonly deliveryTag: number;
    readonly redelivered?: boolean;
    readonly exchange?: string;
    readonly routingKey?: string;
  };
  readonly properties: {
    readonly headers?: Readonly<Record<string, unknown>>;
    readonly messageId?: string;
  };
}

export interface AmqpChannel {
  assertQueue(
    queue: string,
    options?: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  sendToQueue(
    queue: string,
    content: Buffer,
    options?: Readonly<Record<string, unknown>>,
  ): boolean;
  consume(
    queue: string,
    onMessage: (message: AmqpMessage | null) => void,
    options?: Readonly<Record<string, unknown>>,
  ): Promise<{ readonly consumerTag: string }>;
  cancel(consumerTag: string): Promise<unknown>;
  ack(message: AmqpMessage): void;
  nack(message: AmqpMessage, allUpTo?: boolean, requeue?: boolean): void;
  close(): Promise<void>;
  on?(event: string, listener: (...args: readonly unknown[]) => void): void;
}

export interface AmqpConnection {
  createChannel(): Promise<AmqpChannel>;
  close(): Promise<void>;
  on?(event: string, listener: (...args: readonly unknown[]) => void): void;
}

export interface AmqpLibModule {
  connect(url: string): Promise<AmqpConnection>;
}

export interface RabbitMqBrokerDriverOptions {
  readonly url?: string;
  readonly prefetch?: number;
}

/**
 * Thin amqplib adapter implementing {@link BrokerDriver}.
 * Retry / dead-letter routing stays in the broker adapter layer.
 */
export class RabbitMqSdkDriver implements BrokerDriver {
  private connection?: AmqpConnection;
  private channel?: AmqpChannel;
  private readonly consumers = new Map<string, string>();
  private readonly handlers = new Map<string, Set<DriverDeliveryHandler>>();
  private readonly disconnectHandlers = new Set<() => void>();

  public constructor(
    private readonly amqp: AmqpLibModule,
    private readonly options: RabbitMqBrokerDriverOptions = {},
  ) {}

  public async connect(): Promise<void> {
    const url =
      this.options.url ?? process.env.MESSAGE_BROKER_URL ?? 'amqp://localhost';
    this.connection = await this.amqp.connect(url);
    this.channel = await this.connection.createChannel();
    this.connection.on?.('close', () => {
      for (const handler of this.disconnectHandlers) handler();
    });
  }

  public async disconnect(): Promise<void> {
    for (const tag of this.consumers.values()) {
      await this.channel?.cancel(tag).catch(() => undefined);
    }
    this.consumers.clear();
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
    this.channel = undefined;
    this.connection = undefined;
  }

  public async publish(
    topic: string,
    payload: unknown,
    attempt = 0,
  ): Promise<string> {
    if (!this.channel) {
      throw new Error('RabbitMQ driver is not connected');
    }
    await this.channel.assertQueue(topic, { durable: true });
    const id = `${topic}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    this.channel.sendToQueue(
      topic,
      Buffer.from(JSON.stringify({ payload, attempt })),
      {
        persistent: true,
        messageId: id,
        headers: { attempt },
      },
    );
    return id;
  }

  public subscribe(
    topic: string,
    handler: DriverDeliveryHandler,
  ): DriverUnsubscribe {
    if (!this.channel) {
      throw new Error('RabbitMQ driver is not connected');
    }
    const handlers = this.handlers.get(topic) ?? new Set();
    handlers.add(handler);
    this.handlers.set(topic, handlers);
    void this.ensureConsumer(topic);
    return (): void => {
      handlers.delete(handler);
    };
  }

  public onDisconnect(handler: () => void): DriverUnsubscribe {
    this.disconnectHandlers.add(handler);
    return (): void => {
      this.disconnectHandlers.delete(handler);
    };
  }

  private async ensureConsumer(topic: string): Promise<void> {
    if (this.consumers.has(topic)) return;
    const channel = this.channel!;
    await channel.assertQueue(topic, { durable: true });
    const { consumerTag } = await channel.consume(
      topic,
      (message) => {
        if (!message) return;
        void this.dispatch(topic, message);
      },
      { noAck: false },
    );
    this.consumers.set(topic, consumerTag);
  }

  private async dispatch(topic: string, message: AmqpMessage): Promise<void> {
    const channel = this.channel;
    if (!channel) return;
    const handlers = this.handlers.get(topic);
    if (!handlers || handlers.size === 0) {
      channel.nack(message, false, true);
      return;
    }
    const envelope = parseEnvelope(message.content.toString('utf8'));
    const attempt =
      typeof message.properties.headers?.attempt === 'number'
        ? message.properties.headers.attempt
        : envelope.attempt;
    let settled = false;
    const delivery = {
      id:
        message.properties.messageId ??
        `${topic}:${message.fields.deliveryTag}`,
      topic,
      payload: envelope.payload,
      attempt,
      ack: (): Promise<void> => {
        if (settled) return Promise.resolve();
        settled = true;
        channel.ack(message);
        return Promise.resolve();
      },
      nack: (retry = true): Promise<void> => {
        if (settled) return Promise.resolve();
        settled = true;
        channel.nack(message, false, retry);
        return Promise.resolve();
      },
    };
    await Promise.all([...handlers].map((handler) => handler(delivery)));
  }
}

export function loadRabbitMqDriver<T = AmqpLibModule>(
  resolver?: ModuleResolver,
): T {
  return loadDriver<T>('amqplib', resolver);
}

export function createRabbitMqBrokerDriver(
  options: RabbitMqBrokerDriverOptions = {},
  resolver?: ModuleResolver,
): BrokerDriver {
  return new RabbitMqSdkDriver(loadRabbitMqDriver<AmqpLibModule>(resolver), {
    ...options,
    url: options.url ?? process.env.MESSAGE_BROKER_URL,
  });
}

function parseEnvelope(raw: string): { payload: unknown; attempt: number } {
  try {
    const parsed = JSON.parse(raw) as { payload?: unknown; attempt?: number };
    if (parsed && typeof parsed === 'object' && 'payload' in parsed) {
      return {
        payload: parsed.payload,
        attempt: Number(parsed.attempt ?? 0),
      };
    }
    return { payload: parsed, attempt: 0 };
  } catch {
    return { payload: raw, attempt: 0 };
  }
}
