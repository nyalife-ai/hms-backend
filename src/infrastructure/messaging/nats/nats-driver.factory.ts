import { loadDriver, type ModuleResolver } from '../../optional-driver';
import type {
  BrokerDriver,
  DriverDeliveryHandler,
  DriverUnsubscribe,
} from '../broker.types';

/** Minimal nats surface used by {@link NatsSdkDriver}. */
export interface NatsMsg {
  readonly subject: string;
  readonly data: Uint8Array;
  readonly sid?: number;
  respond?(data?: Uint8Array): boolean;
}

export interface NatsSubscription {
  unsubscribe(): void;
  getSubject?(): string;
  [Symbol.asyncIterator]?: () => AsyncIterator<NatsMsg>;
}

export interface NatsConnection {
  publish(subject: string, data?: Uint8Array | string): void;
  subscribe(
    subject: string,
    options?: {
      callback?: (error: Error | null, message: NatsMsg) => void;
    },
  ): NatsSubscription;
  close(): Promise<void> | void;
  closed?: Promise<void> | (() => Promise<void>);
  isClosed?(): boolean;
}

export interface NatsModule {
  connect(options?: {
    readonly servers?: string | readonly string[];
  }): Promise<NatsConnection>;
  StringCodec?(): {
    encode(value: string): Uint8Array;
    decode(value: Uint8Array): string;
  };
}

export interface NatsBrokerDriverOptions {
  readonly url?: string;
  readonly servers?: string | readonly string[];
}

/**
 * Thin nats adapter implementing {@link BrokerDriver}.
 * Core NATS has no broker-level ack; ack/nack are local settlement hooks
 * so the adapter layer can apply retries / dead-letter publish.
 */
export class NatsSdkDriver implements BrokerDriver {
  private connection?: NatsConnection;
  private readonly subscriptions = new Map<string, NatsSubscription>();
  private readonly handlers = new Map<string, Set<DriverDeliveryHandler>>();
  private readonly disconnectHandlers = new Set<() => void>();
  private readonly pending = new Map<
    string,
    {
      readonly topic: string;
      readonly payload: unknown;
      readonly attempt: number;
    }
  >();

  public constructor(
    private readonly nats: NatsModule,
    private readonly options: NatsBrokerDriverOptions = {},
  ) {}

  public async connect(): Promise<void> {
    const servers =
      this.options.servers ??
      this.options.url ??
      process.env.MESSAGE_BROKER_URL ??
      'nats://localhost:4222';
    this.connection = await this.nats.connect({ servers });
    const closed = this.connection.closed;
    const closedPromise =
      typeof closed === 'function' ? closed.call(this.connection) : closed;
    void closedPromise?.then(() => {
      for (const handler of this.disconnectHandlers) handler();
    });
  }

  public async disconnect(): Promise<void> {
    for (const subscription of this.subscriptions.values()) {
      subscription.unsubscribe();
    }
    this.subscriptions.clear();
    await this.connection?.close();
    this.connection = undefined;
  }

  public publish(
    topic: string,
    payload: unknown,
    attempt = 0,
  ): Promise<string> {
    if (!this.connection) {
      return Promise.reject(new Error('NATS driver is not connected'));
    }
    const id = `${topic}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    const body = JSON.stringify({ id, payload, attempt });
    this.connection.publish(topic, this.encode(body));
    return Promise.resolve(id);
  }

  public subscribe(
    topic: string,
    handler: DriverDeliveryHandler,
  ): DriverUnsubscribe {
    const handlers = this.handlers.get(topic) ?? new Set();
    handlers.add(handler);
    this.handlers.set(topic, handlers);
    this.ensureSubscription(topic);
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

  private ensureSubscription(topic: string): void {
    if (!this.connection) {
      throw new Error('NATS driver is not connected');
    }
    if (this.subscriptions.has(topic)) return;
    const subscription = this.connection.subscribe(topic, {
      callback: (error, message) => {
        if (error) return;
        void this.dispatch(topic, message);
      },
    });
    this.subscriptions.set(topic, subscription);
  }

  private async dispatch(topic: string, message: NatsMsg): Promise<void> {
    const handlers = this.handlers.get(topic);
    if (!handlers || handlers.size === 0) return;
    const envelope = parseEnvelope(this.decode(message.data));
    const id =
      typeof envelope.id === 'string' ? envelope.id : `${topic}:${Date.now()}`;
    this.pending.set(id, {
      topic,
      payload: envelope.payload,
      attempt: envelope.attempt,
    });
    let settled = false;
    const delivery = {
      id,
      topic,
      payload: envelope.payload,
      attempt: envelope.attempt,
      ack: (): Promise<void> => {
        if (settled) return Promise.resolve();
        settled = true;
        this.pending.delete(id);
        return Promise.resolve();
      },
      nack: async (retry = true): Promise<void> => {
        if (settled) return;
        settled = true;
        const pending = this.pending.get(id);
        this.pending.delete(id);
        if (retry && pending) {
          await this.publish(pending.topic, pending.payload, pending.attempt);
        }
      },
    };
    await Promise.all([...handlers].map((handler) => handler(delivery)));
  }

  private encode(value: string): Uint8Array {
    if (this.nats.StringCodec) {
      return this.nats.StringCodec().encode(value);
    }
    return new TextEncoder().encode(value);
  }

  private decode(value: Uint8Array): string {
    if (this.nats.StringCodec) {
      return this.nats.StringCodec().decode(value);
    }
    return new TextDecoder().decode(value);
  }
}

export function loadNatsDriver<T = NatsModule>(resolver?: ModuleResolver): T {
  return loadDriver<T>('nats', resolver);
}

export function createNatsBrokerDriver(
  options: NatsBrokerDriverOptions = {},
  resolver?: ModuleResolver,
): BrokerDriver {
  return new NatsSdkDriver(loadNatsDriver<NatsModule>(resolver), {
    ...options,
    url: options.url ?? process.env.MESSAGE_BROKER_URL,
  });
}

function parseEnvelope(raw: string): {
  id?: string;
  payload: unknown;
  attempt: number;
} {
  try {
    const parsed = JSON.parse(raw) as {
      id?: string;
      payload?: unknown;
      attempt?: number;
    };
    if (parsed && typeof parsed === 'object' && 'payload' in parsed) {
      return {
        id: parsed.id,
        payload: parsed.payload,
        attempt: Number(parsed.attempt ?? 0),
      };
    }
    return { payload: parsed, attempt: 0 };
  } catch {
    return { payload: raw, attempt: 0 };
  }
}
