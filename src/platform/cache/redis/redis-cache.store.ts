import { CacheSetOptions, CacheStore } from '../contracts/cache.interface';
import { RedisClientLike } from './redis.types';

export class RedisCacheStore implements CacheStore {
  private readonly prefix: string;

  public constructor(
    private readonly client: RedisClientLike,
    namespace = 'cache',
  ) {
    this.prefix = `${namespace.replace(/:+$/u, '')}:`;
  }

  public async get<T>(key: string): Promise<T | undefined> {
    const serialized = await this.client.get(this.toRedisKey(key));
    if (serialized === null) {
      return undefined;
    }
    return JSON.parse(serialized) as T;
  }

  public async set<T>(
    key: string,
    value: T,
    options: CacheSetOptions = {},
  ): Promise<void> {
    const redisKey = this.toRedisKey(key);
    const serialized = JSON.stringify(value);
    const ttlSeconds = options.ttlSeconds ?? options.ttl;
    if (serialized === undefined) {
      throw new TypeError('Cache values must be JSON-serializable');
    }
    if (ttlSeconds !== undefined) {
      if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
        await this.client.del(redisKey);
        return;
      }
      await this.client.setex(redisKey, ttlSeconds, serialized);
      return;
    }
    await this.client.set(redisKey, serialized);
  }

  public async del(key: string): Promise<boolean> {
    return (await this.client.del(this.toRedisKey(key))) > 0;
  }

  public async has(key: string): Promise<boolean> {
    return (await this.client.exists(this.toRedisKey(key))) > 0;
  }

  public async clear(): Promise<void> {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.client.scan(
        cursor,
        'MATCH',
        `${this.prefix}*`,
        'COUNT',
        100,
      );
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
      cursor = nextCursor;
    } while (cursor !== '0');
  }

  private toRedisKey(key: string): string {
    return `${this.prefix}${key.replace(/^:+/u, '')}`;
  }
}
