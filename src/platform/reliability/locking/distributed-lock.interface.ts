export interface DistributedLock {
  acquire(key: string, ttlMilliseconds: number): Promise<string | undefined>;
  release(key: string, token: string): Promise<boolean>;
  renew(key: string, token: string, ttlMilliseconds: number): Promise<boolean>;
}

export interface RedisClientLike {
  set(
    key: string,
    value: string,
    expiryMode: 'PX',
    ttlMilliseconds: number,
    condition: 'NX',
  ): Promise<'OK' | null>;
  eval(
    script: string,
    numberOfKeys: number,
    ...args: readonly string[]
  ): Promise<unknown>;
}
