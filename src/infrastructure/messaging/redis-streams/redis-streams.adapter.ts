import type { RedisDriver } from '../../redis/redis.types';
import { BaseBrokerAdapter } from '../base-broker.adapter';
import type {
  BrokerAdapterOptions,
  BrokerDriver,
  BrokerLogger,
  DriverDeliveryHandler,
  DriverUnsubscribe,
} from '../broker.types';

export interface RedisStreamsOptions extends BrokerAdapterOptions {
  readonly group?: string;
  readonly consumer?: string;
  readonly blockMs?: number;
  /**
   * When true, {@link RedisStreamsDriver.disconnect} quits/disconnects the
   * underlying Redis client. Defaults to false so a shared client is left open.
   */
  readonly ownsConnection?: boolean;
}

/**
 * Redis Streams {@link BrokerDriver}.
 *
 * ## Acknowledgement semantics
 * - `ack()`: `XACK` — removes the entry from the consumer-group PEL.
 * - `nack(true)`: `XACK` the current id, then `XADD` the payload back onto the
 *   same stream with `attempt + 1` (explicit requeue / republish). This avoids
 *   orphaned PEL entries while remaining XCLAIM-friendly for other consumers.
 * - `nack(false)`: `XACK` the current id. When `deadLetterTopic` is configured,
 *   also `XADD` the payload to that stream (dead-letter). Otherwise the message
 *   is discarded from the group.
 *
 * Retry / max-attempt policy used by {@link RedisStreamsAdapter} still lives in
 * {@link BaseBrokerAdapter}; that layer always calls `nack(false)` then
 * republishes when retrying. Prefer leaving `deadLetterTopic` unset on the
 * driver when relying on the adapter's dead-letter publish path to avoid
 * duplicate DLQ writes.
 */
class RedisStreamsDriver implements BrokerDriver {
  private readonly disconnectHandlers = new Set<() => void>();

  public constructor(
    private readonly redis: RedisDriver,
    private readonly options: RedisStreamsOptions,
  ) {}

  public connect(): Promise<void> {
    return this.redis.connect();
  }

  public async disconnect(): Promise<void> {
    if (this.options.ownsConnection !== true) {
      return;
    }
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }

  public publish(
    topic: string,
    payload: unknown,
    attempt = 0,
  ): Promise<string> {
    return this.redis.xadd(
      topic,
      '*',
      'payload',
      JSON.stringify(payload),
      'attempt',
      String(attempt),
    );
  }

  public subscribe(
    topic: string,
    handler: DriverDeliveryHandler,
  ): DriverUnsubscribe {
    let active = true;
    const group = this.options.group ?? 'application';
    const consumer = this.options.consumer ?? 'consumer';
    void this.redis
      .xgroup('CREATE', topic, group, '0', 'MKSTREAM')
      .catch((): void => undefined);
    const poll = async (): Promise<void> => {
      while (active) {
        try {
          const entries = await this.redis.xreadgroup(
            'GROUP',
            group,
            consumer,
            'COUNT',
            10,
            'BLOCK',
            this.options.blockMs ?? 1_000,
            'STREAMS',
            topic,
            '>',
          );
          for (const [, messages] of entries ?? []) {
            for (const [id, fields] of messages) {
              const values = this.fields(fields);
              const payload = JSON.parse(values.payload ?? 'null') as unknown;
              const attempt = Number(values.attempt ?? 0);
              await handler({
                id,
                topic,
                payload,
                attempt,
                ack: async (): Promise<void> => {
                  await this.redis.xack(topic, group, id);
                },
                nack: async (retry = true): Promise<void> => {
                  await this.redis.xack(topic, group, id);
                  if (retry) {
                    await this.publish(topic, payload, attempt + 1);
                    return;
                  }
                  if (this.options.deadLetterTopic) {
                    await this.publish(
                      this.options.deadLetterTopic,
                      payload,
                      attempt + 1,
                    );
                  }
                },
              });
            }
          }
        } catch {
          for (const callback of this.disconnectHandlers) callback();
          return;
        }
      }
    };
    void poll();
    return (): void => {
      active = false;
    };
  }

  public onDisconnect(handler: () => void): DriverUnsubscribe {
    this.disconnectHandlers.add(handler);
    return (): void => {
      this.disconnectHandlers.delete(handler);
    };
  }

  private fields(fields: readonly string[]): Readonly<Record<string, string>> {
    const result: Record<string, string> = {};
    for (let index = 0; index < fields.length; index += 2) {
      result[fields[index]] = fields[index + 1];
    }
    return result;
  }
}

export class RedisStreamsAdapter extends BaseBrokerAdapter {
  public constructor(
    redis: RedisDriver,
    options: RedisStreamsOptions = {},
    logger?: BrokerLogger,
  ) {
    super(new RedisStreamsDriver(redis, options), options, logger);
  }
}
