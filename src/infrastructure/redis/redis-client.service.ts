import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type {
  RedisClientLike,
  RedisSetResult,
} from '../../platform/cache/redis/redis.types';
import type {
  RedisConnectionOptions,
  RedisDriver,
  RedisHealth,
  RedisSleeper,
  RedisTimer,
} from './redis.types';

const systemTimer: RedisTimer = {
  set: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clear: (handle) => clearTimeout(handle as NodeJS.Timeout),
};
const sleep: RedisSleeper = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

@Injectable()
export class RedisClientService
  implements RedisClientLike, OnModuleInit, OnModuleDestroy
{
  private connected = false;
  private connecting?: Promise<void>;
  private readonly commandTimeoutMs: number;

  public constructor(
    public readonly driver: RedisDriver,
    private readonly options: RedisConnectionOptions = {},
    private readonly sleeper: RedisSleeper = sleep,
    private readonly timer: RedisTimer = systemTimer,
    private readonly now: () => number = Date.now,
    private readonly random: () => number = Math.random,
  ) {
    this.commandTimeoutMs = options.commandTimeoutMs ?? 5_000;
  }

  public async onModuleInit(): Promise<void> {
    await this.connect();
  }

  public async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  public async connect(): Promise<void> {
    if (this.connected) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.connectWithRetry();
    try {
      await this.connecting;
      this.connected = true;
    } finally {
      this.connecting = undefined;
    }
  }

  private async connectWithRetry(): Promise<void> {
    const maximum = this.options.maxReconnectAttempts ?? 3;
    let attempt = 0;
    while (true) {
      try {
        await this.driver.connect();
        return;
      } catch (error: unknown) {
        attempt += 1;
        if (attempt >= maximum) throw error;
        await this.sleeper(this.retryDelay(attempt));
      }
    }
  }

  public retryStrategy(): (attempt: number) => number | null {
    const maximum = this.options.maxReconnectAttempts ?? 3;
    return (attempt) => (attempt > maximum ? null : this.retryDelay(attempt));
  }

  private retryDelay(attempt: number): number {
    const base = this.options.reconnectBaseDelayMs ?? 100;
    const maximum = this.options.reconnectMaxDelayMs ?? 30_000;
    const exponential = Math.min(maximum, base * 2 ** Math.max(0, attempt - 1));
    return Math.floor(exponential * (0.5 + this.random() * 0.5));
  }

  public async disconnect(): Promise<void> {
    if (!this.connected) return;
    try {
      await this.driver.quit();
    } catch {
      this.driver.disconnect();
    } finally {
      this.connected = false;
    }
  }

  public async healthCheck(): Promise<RedisHealth> {
    const started = this.now();
    try {
      await this.withTimeout(this.driver.ping());
      return { status: 'up', latencyMs: this.now() - started };
    } catch (error: unknown) {
      return {
        status: 'down',
        latencyMs: this.now() - started,
        error: RedisClientService.maskError(error),
      };
    }
  }

  public static maskError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(
      /(redis(?:s)?:\/\/[^:\s/]+:)([^@\s]+)(@)/giu,
      '$1***$3',
    );
  }

  public withTimeout<T>(
    operation: Promise<T>,
    timeoutMs = this.commandTimeoutMs,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const handle = this.timer.set(
        () => reject(new Error(`Redis command timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
      operation.then(
        (value) => {
          this.timer.clear(handle);
          resolve(value);
        },
        (error: unknown) => {
          this.timer.clear(handle);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  }

  public get(key: string): Promise<string | null> {
    return this.withTimeout(this.driver.get(key));
  }

  public set(key: string, value: string): Promise<RedisSetResult>;
  public set(
    key: string,
    value: string,
    expiryMode: 'PX',
    ttlMilliseconds: number,
    condition: 'NX',
  ): Promise<RedisSetResult>;
  public set(
    key: string,
    value: string,
    expiryMode?: 'PX',
    ttlMilliseconds?: number,
    condition?: 'NX',
  ): Promise<RedisSetResult> {
    const operation =
      expiryMode === undefined
        ? this.driver.set(key, value)
        : this.driver.set(
            key,
            value,
            expiryMode,
            ttlMilliseconds as number,
            condition as 'NX',
          );
    return this.withTimeout(operation);
  }

  public setex(key: string, ttlSeconds: number, value: string): Promise<'OK'> {
    return this.withTimeout(this.driver.setex(key, ttlSeconds, value));
  }

  public del(...keys: string[]): Promise<number> {
    return this.withTimeout(this.driver.del(...keys));
  }

  public exists(key: string): Promise<number> {
    return this.withTimeout(this.driver.exists(key));
  }

  public eval(
    script: string,
    numberOfKeys: number,
    ...args: string[]
  ): Promise<unknown> {
    return this.withTimeout(this.driver.eval(script, numberOfKeys, ...args));
  }

  public scan(
    cursor: string,
    matchToken: 'MATCH',
    pattern: string,
    countToken: 'COUNT',
    count: number,
  ): Promise<[string, string[]]> {
    return this.withTimeout(
      this.driver.scan(cursor, matchToken, pattern, countToken, count),
    );
  }
}
