import type {
  RedisClientLike,
  RedisSetResult,
} from '../../platform/cache/redis/redis.types';

export type RedisStatus = 'up' | 'down';

export interface RedisConnectionOptions {
  /** Prefer when present; host/port/password/db are derived from the URL. */
  readonly url?: string;
  readonly host?: string;
  readonly port?: number;
  readonly db?: number;
  readonly password?: string;
  readonly tls?: boolean;
  readonly commandTimeoutMs?: number;
  readonly maxReconnectAttempts?: number;
  readonly reconnectBaseDelayMs?: number;
  readonly reconnectMaxDelayMs?: number;
}

export interface RedisPipeline {
  exec(): Promise<readonly unknown[]>;
}

export interface RedisDriver extends RedisClientLike {
  readonly status?: string;
  connect(): Promise<void>;
  quit(): Promise<'OK'>;
  disconnect(): void;
  ping(): Promise<string>;
  on(event: string, listener: (...args: readonly unknown[]) => void): this;
  pipeline(): RedisPipeline;
  xadd(key: string, id: '*', ...fields: string[]): Promise<string>;
  xgroup(
    command: 'CREATE',
    key: string,
    group: string,
    id: string,
    mkstream?: 'MKSTREAM',
  ): Promise<string>;
  xreadgroup(
    groupToken: 'GROUP',
    group: string,
    consumer: string,
    countToken: 'COUNT',
    count: number,
    blockToken: 'BLOCK',
    blockMs: number,
    streamsToken: 'STREAMS',
    key: string,
    id: '>',
  ): Promise<
    readonly [string, readonly [string, readonly string[]][]][] | null
  >;
  xack(key: string, group: string, ...ids: string[]): Promise<number>;
}

export interface RedisHealth {
  readonly status: RedisStatus;
  readonly latencyMs: number;
  readonly error?: string;
}

export type RedisSetReturn = RedisSetResult;

export interface RedisTimer {
  set(callback: () => void, milliseconds: number): unknown;
  clear(handle: unknown): void;
}

export type RedisSleeper = (milliseconds: number) => Promise<void>;
