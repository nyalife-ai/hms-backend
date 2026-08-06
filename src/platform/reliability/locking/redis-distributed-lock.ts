import { Injectable } from '@nestjs/common';
import { generateId } from '../../../core';
import type {
  DistributedLock,
  RedisClientLike,
} from './distributed-lock.interface';

const RELEASE_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then " +
  "return redis.call('del', KEYS[1]) else return 0 end";

const RENEW_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then " +
  "return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end";

@Injectable()
export class RedisDistributedLock implements DistributedLock {
  public constructor(
    private readonly client: RedisClientLike,
    private readonly tokenFactory: () => string = () =>
      generateId('reliability-lock'),
  ) {}

  public async acquire(
    key: string,
    ttlMilliseconds: number,
  ): Promise<string | undefined> {
    this.validate(key, ttlMilliseconds);
    const token = this.tokenFactory();
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

  public async renew(
    key: string,
    token: string,
    ttlMilliseconds: number,
  ): Promise<boolean> {
    this.validate(key, ttlMilliseconds);
    const result = await this.client.eval(
      RENEW_SCRIPT,
      1,
      key,
      token,
      String(ttlMilliseconds),
    );
    return result === 1;
  }

  private validate(key: string, ttlMilliseconds: number): void {
    if (key.trim().length === 0) {
      throw new TypeError('Lock key cannot be empty');
    }
    if (!Number.isFinite(ttlMilliseconds) || ttlMilliseconds <= 0) {
      throw new RangeError('Lock TTL must be a positive finite number');
    }
  }
}
