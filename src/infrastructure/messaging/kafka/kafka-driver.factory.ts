import { loadDriver, type ModuleResolver } from '../../optional-driver';
import type {
  BrokerDriver,
  DriverDeliveryHandler,
  DriverUnsubscribe,
} from '../broker.types';

/** Minimal kafkajs surface used by {@link KafkaSdkDriver}. */
export interface KafkaJsMessage {
  readonly offset: string;
  readonly key: Buffer | string | null;
  readonly value: Buffer | string | null;
  readonly headers?: Readonly<Record<string, Buffer | string | undefined>>;
}

export interface KafkaJsEachMessagePayload {
  readonly topic: string;
  readonly partition: number;
  readonly message: KafkaJsMessage;
}

export interface KafkaJsProducer {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(record: {
    readonly topic: string;
    readonly messages: ReadonlyArray<{
      readonly key?: string;
      readonly value: string;
      readonly headers?: Readonly<Record<string, string>>;
    }>;
  }): Promise<unknown>;
}

export interface KafkaJsConsumer {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(options: {
    readonly topic: string;
    readonly fromBeginning?: boolean;
  }): Promise<void>;
  run(options: {
    readonly autoCommit?: boolean;
    eachMessage(payload: KafkaJsEachMessagePayload): Promise<void>;
  }): Promise<void>;
  commitOffsets(
    offsets: ReadonlyArray<{
      readonly topic: string;
      readonly partition: number;
      readonly offset: string;
    }>,
  ): Promise<void>;
  seek(options: {
    readonly topic: string;
    readonly partition: number;
    readonly offset: string;
  }): void;
  on?(event: string, listener: (...args: readonly unknown[]) => void): void;
  events?: { readonly DISCONNECT?: string };
}

export interface KafkaJsClient {
  producer(): KafkaJsProducer;
  consumer(config: { readonly groupId: string }): KafkaJsConsumer;
}

export interface KafkaJsModule {
  readonly Kafka: new (config: {
    readonly clientId: string;
    readonly brokers: readonly string[];
  }) => KafkaJsClient;
}

export interface KafkaBrokerDriverOptions {
  readonly url?: string;
  readonly brokers?: readonly string[];
  readonly clientId?: string;
  readonly groupId?: string;
}

/**
 * Thin kafkajs adapter implementing {@link BrokerDriver}.
 * Retry / dead-letter routing stays in the broker adapter layer.
 */
export class KafkaSdkDriver implements BrokerDriver {
  private producer?: KafkaJsProducer;
  private consumer?: KafkaJsConsumer;
  private running = false;
  private readonly handlers = new Map<string, Set<DriverDeliveryHandler>>();
  private readonly disconnectHandlers = new Set<() => void>();

  public constructor(
    private readonly kafkaModule: KafkaJsModule,
    private readonly options: KafkaBrokerDriverOptions = {},
  ) {}

  public async connect(): Promise<void> {
    const client = new this.kafkaModule.Kafka({
      clientId: this.options.clientId ?? 'nyalife-api',
      brokers: resolveKafkaBrokers(this.options),
    });
    this.producer = client.producer();
    this.consumer = client.consumer({
      groupId: this.options.groupId ?? 'nyalife-api',
    });
    await Promise.all([this.producer.connect(), this.consumer.connect()]);
    const disconnectEvent =
      this.consumer.events?.DISCONNECT ?? 'consumer.disconnect';
    this.consumer.on?.(disconnectEvent, () => {
      for (const handler of this.disconnectHandlers) handler();
    });
  }

  public async disconnect(): Promise<void> {
    this.running = false;
    await Promise.all([
      this.consumer?.disconnect() ?? Promise.resolve(),
      this.producer?.disconnect() ?? Promise.resolve(),
    ]);
    this.consumer = undefined;
    this.producer = undefined;
  }

  public async publish(
    topic: string,
    payload: unknown,
    attempt = 0,
  ): Promise<string> {
    if (!this.producer) {
      throw new Error('Kafka driver is not connected');
    }
    const value = JSON.stringify({ payload, attempt });
    await this.producer.send({
      topic,
      messages: [{ value, headers: { attempt: String(attempt) } }],
    });
    return `${topic}:${Date.now()}`;
  }

  public subscribe(
    topic: string,
    handler: DriverDeliveryHandler,
  ): DriverUnsubscribe {
    if (!this.consumer) {
      throw new Error('Kafka driver is not connected');
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
    await this.consumer!.subscribe({ topic, fromBeginning: false });
    if (this.running) return;
    this.running = true;
    await this.consumer!.run({
      autoCommit: false,
      eachMessage: async (data) => {
        await this.dispatch(data);
      },
    });
  }

  private async dispatch(data: KafkaJsEachMessagePayload): Promise<void> {
    const handlers = this.handlers.get(data.topic);
    if (!handlers || handlers.size === 0) return;
    const raw = decodeKafkaValue(data.message.value);
    const { payload, attempt } = parseEnvelope(raw);
    const id = `${data.topic}:${data.partition}:${data.message.offset}`;
    let settled = false;
    const delivery = {
      id,
      topic: data.topic,
      payload,
      attempt,
      ack: async (): Promise<void> => {
        if (settled || !this.consumer) return;
        settled = true;
        await this.consumer.commitOffsets([
          {
            topic: data.topic,
            partition: data.partition,
            offset: String(Number(data.message.offset) + 1),
          },
        ]);
      },
      nack: async (retry = true): Promise<void> => {
        if (settled || !this.consumer) return;
        settled = true;
        if (retry) {
          this.consumer.seek({
            topic: data.topic,
            partition: data.partition,
            offset: data.message.offset,
          });
          return;
        }
        await this.consumer.commitOffsets([
          {
            topic: data.topic,
            partition: data.partition,
            offset: String(Number(data.message.offset) + 1),
          },
        ]);
      },
    };
    await Promise.all([...handlers].map((handler) => handler(delivery)));
  }
}

export function loadKafkaDriver<T = KafkaJsModule>(
  resolver?: ModuleResolver,
): T {
  return loadDriver<T>('kafkajs', resolver);
}

export function createKafkaBrokerDriver(
  options: KafkaBrokerDriverOptions = {},
  resolver?: ModuleResolver,
): BrokerDriver {
  return new KafkaSdkDriver(loadKafkaDriver<KafkaJsModule>(resolver), {
    ...options,
    url: options.url ?? process.env.MESSAGE_BROKER_URL,
  });
}

export function resolveKafkaBrokers(
  options: KafkaBrokerDriverOptions,
): string[] {
  if (options.brokers && options.brokers.length > 0) {
    return [...options.brokers];
  }
  const url = options.url ?? process.env.MESSAGE_BROKER_URL;
  if (!url) {
    return ['localhost:9092'];
  }
  try {
    const parsed = new URL(url);
    if (parsed.hostname) {
      return [`${parsed.hostname}:${parsed.port || '9092'}`];
    }
  } catch {
    // comma-separated host:port list without a scheme
  }
  return url
    .replace(/^[a-z]+:\/\//i, '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function decodeKafkaValue(value: Buffer | string | null): string {
  if (value === null) return 'null';
  return typeof value === 'string' ? value : value.toString('utf8');
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
