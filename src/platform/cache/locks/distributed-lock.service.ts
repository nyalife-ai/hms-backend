import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENT } from '../contracts/cache.tokens';
import type { RedisClientLike } from '../redis/redis.types';

const RELEASE_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then " +
  "return redis.call('del', KEYS[1]) else return 0 end";

export interface DistributedLock {
  acquire(key: string, ttlMilliseconds: number): Promise<string | undefined>;
  release(key: string, token: string): Promise<boolean>;
  withToken<T>(
    key: string,
    ttlMilliseconds: number,
    operation: (token: string) => Promise<T> | T,
  ): Promise<T>;
}

@Injectable()
export class DistributedLockService implements DistributedLock {
  public constructor(
    @Inject(REDIS_CLIENT) private readonly client: RedisClientLike,
  ) {}

  public async acquire(
    key: string,
    ttlMilliseconds: number,
  ): Promise<string | undefined> {
    this.assertTtl(ttlMilliseconds);
    const token = randomUUID();
    const result = await this.client.set(
      key,
      token,
      'PX',
      ttlMilliseconds,
      'NX',
    );
    return result === 'OK' ? token : undefined;
  }

  public async release(key: string, token: string): Promise<boolean> {
    const result = await this.client.eval(RELEASE_SCRIPT, 1, key, token);
    return result === 1;
  }

  public async withToken<T>(
    key: string,
    ttlMilliseconds: number,
    operation: (token: string) => Promise<T> | T,
  ): Promise<T> {
    const token = await this.acquire(key, ttlMilliseconds);
    if (!token) {
      throw new Error(`Lock "${key}" is already held`);
    }
    try {
      return await operation(token);
    } finally {
      await this.release(key, token);
    }
  }

  private assertTtl(ttlMilliseconds: number): void {
    if (!Number.isFinite(ttlMilliseconds) || ttlMilliseconds <= 0) {
      throw new RangeError('Lock TTL must be a positive number');
    }
  }
}

interface InMemoryLockEntry {
  readonly token: string;
  readonly expiresAt: number;
}

export class InMemoryDistributedLock implements DistributedLock {
  private readonly locks = new Map<string, InMemoryLockEntry>();

  public constructor(
    private readonly now: () => number = Date.now,
    private readonly tokenFactory: () => string = randomUUID,
  ) {}

  public acquire(
    key: string,
    ttlMilliseconds: number,
  ): Promise<string | undefined> {
    if (!Number.isFinite(ttlMilliseconds) || ttlMilliseconds <= 0) {
      return Promise.reject(
        new RangeError('Lock TTL must be a positive number'),
      );
    }
    const current = this.locks.get(key);
    if (current && current.expiresAt > this.now()) {
      return Promise.resolve(undefined);
    }
    const token = this.tokenFactory();
    this.locks.set(key, { token, expiresAt: this.now() + ttlMilliseconds });
    return Promise.resolve(token);
  }

  public release(key: string, token: string): Promise<boolean> {
    const current = this.locks.get(key);
    if (!current || current.token !== token) {
      return Promise.resolve(false);
    }
    this.locks.delete(key);
    return Promise.resolve(true);
  }

  public async withToken<T>(
    key: string,
    ttlMilliseconds: number,
    operation: (token: string) => Promise<T> | T,
  ): Promise<T> {
    const token = await this.acquire(key, ttlMilliseconds);
    if (!token) {
      throw new Error(`Lock "${key}" is already held`);
    }
    try {
      return await operation(token);
    } finally {
      await this.release(key, token);
    }
  }
}
