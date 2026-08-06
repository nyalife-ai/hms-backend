import type { ModuleResolver } from '../optional-driver';
import { loadDriver } from '../optional-driver';
import type { RedisConnectionOptions, RedisDriver } from './redis.types';

interface IoRedisConstructor {
  new (options: Readonly<Record<string, unknown>>): RedisDriver;
}

type IoRedisModule =
  IoRedisConstructor | { readonly default: IoRedisConstructor };

export interface RedisConnectionPair {
  readonly client: RedisDriver;
  readonly subscriber: RedisDriver;
  readonly safeDescription: string;
}

export function maskRedisUrl(url: string): string {
  return url.replace(/(redis(?:s)?:\/\/[^:\s/]+:)([^@\s]+)(@)/giu, '$1***$3');
}

interface ParsedRedisUrl {
  readonly host: string;
  readonly port: number;
  readonly password?: string;
  readonly db: number;
  readonly tls: boolean;
}

export function parseRedisUrl(url: string): ParsedRedisUrl {
  const parsed = new URL(url);
  const dbPath = parsed.pathname.replace(/^\//u, '');
  const db = dbPath === '' ? 0 : Number(dbPath);
  return {
    host: parsed.hostname || '127.0.0.1',
    port: parsed.port === '' ? 6379 : Number(parsed.port),
    password:
      parsed.password === '' ? undefined : decodeURIComponent(parsed.password),
    db: Number.isFinite(db) ? db : 0,
    tls: parsed.protocol === 'rediss:',
  };
}

function resolveConnectionParts(options: RedisConnectionOptions): Readonly<{
  host: string;
  port: number;
  db: number;
  password?: string;
  tls: boolean;
}> {
  if (options.url !== undefined && options.url !== '') {
    const fromUrl = parseRedisUrl(options.url);
    return {
      host: fromUrl.host,
      port: fromUrl.port,
      db: options.db ?? fromUrl.db,
      password: fromUrl.password ?? options.password,
      tls: options.tls ?? fromUrl.tls,
    };
  }
  return {
    host: options.host ?? '127.0.0.1',
    port: options.port ?? 6379,
    db: options.db ?? 0,
    password: options.password,
    tls: options.tls ?? false,
  };
}

export class RedisConnectionFactory {
  private pair?: RedisConnectionPair;

  public constructor(private readonly resolver?: ModuleResolver) {}

  public create(options: RedisConnectionOptions = {}): RedisConnectionPair {
    if (this.pair) return this.pair;
    const loaded = loadDriver<IoRedisModule>('ioredis', this.resolver);
    const Driver = typeof loaded === 'function' ? loaded : loaded.default;
    const parts = resolveConnectionParts(options);
    const driverOptions: Readonly<Record<string, unknown>> = {
      host: parts.host,
      port: parts.port,
      db: parts.db,
      ...(parts.password === undefined ? {} : { password: parts.password }),
      ...(parts.tls ? { tls: {} } : {}),
      lazyConnect: true,
      retryStrategy: (attempt: number): number | null =>
        attempt > (options.maxReconnectAttempts ?? 3)
          ? null
          : Math.min(
              options.reconnectMaxDelayMs ?? 30_000,
              (options.reconnectBaseDelayMs ?? 100) *
                2 ** Math.max(0, attempt - 1),
            ),
    };
    this.pair = {
      client: new Driver(driverOptions),
      subscriber: new Driver(driverOptions),
      safeDescription: `${parts.tls ? 'rediss' : 'redis'}://${parts.host}:${parts.port}/${parts.db}`,
    };
    return this.pair;
  }
}
