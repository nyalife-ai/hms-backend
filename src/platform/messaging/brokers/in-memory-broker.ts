import { randomUUID } from 'node:crypto';
import { assertPositiveInteger } from '../../architecture/production-defaults';
import {
  BrokerMessage,
  MessageBroker,
  MessageHandler,
  Unsubscribe,
} from './message-broker.interface';

export interface InMemoryMessageBrokerOptions {
  readonly maxRedeliveries?: number;
}

/**
 * Process-local broker for tests. **Not durable** — messages are not persisted.
 */
export class InMemoryMessageBroker implements MessageBroker {
  private readonly handlers = new Map<string, Set<MessageHandler<unknown>>>();
  private readonly maxRedeliveries: number;

  public constructor(
    maxRedeliveriesOrOptions: number | InMemoryMessageBrokerOptions = 3,
  ) {
    const maxRedeliveries =
      typeof maxRedeliveriesOrOptions === 'number'
        ? maxRedeliveriesOrOptions
        : (maxRedeliveriesOrOptions.maxRedeliveries ?? 3);
    this.maxRedeliveries = assertPositiveInteger(
      maxRedeliveries,
      'InMemoryMessageBroker maxRedeliveries',
    );
  }

  public async publish<T>(topic: string, payload: T): Promise<string> {
    if (!topic) {
      throw new Error('Topic must not be empty');
    }
    const id = randomUUID();
    const handlers = [...(this.handlers.get(topic) ?? [])];
    await Promise.all(
      handlers.map((handler) => this.dispatch(topic, id, payload, handler, 1)),
    );
    return id;
  }

  public subscribe<T>(topic: string, handler: MessageHandler<T>): Unsubscribe {
    if (!topic) {
      throw new Error('Topic must not be empty');
    }
    const handlers =
      this.handlers.get(topic) ?? new Set<MessageHandler<unknown>>();
    const compatible = handler as MessageHandler<unknown>;
    handlers.add(compatible);
    this.handlers.set(topic, handlers);
    return (): void => {
      handlers.delete(compatible);
      if (handlers.size === 0) {
        this.handlers.delete(topic);
      }
    };
  }

  private async dispatch(
    topic: string,
    id: string,
    payload: unknown,
    handler: MessageHandler<unknown>,
    attempt: number,
  ): Promise<void> {
    let settled = false;
    let retry = false;
    const message: BrokerMessage = {
      id,
      topic,
      payload,
      attempt,
      ack: (): Promise<void> => {
        settled = true;
        return Promise.resolve();
      },
      nack: (shouldRetry = true): Promise<void> => {
        settled = true;
        retry = shouldRetry;
        return Promise.resolve();
      },
    };
    try {
      await handler(message);
    } catch {
      retry = true;
      settled = true;
    }
    // Unsettled handlers are treated as nack (retry), never silent ack.
    if (!settled) {
      await message.nack(true);
    }
    if (retry && attempt <= this.maxRedeliveries) {
      await this.dispatch(topic, id, payload, handler, attempt + 1);
    }
  }
}
