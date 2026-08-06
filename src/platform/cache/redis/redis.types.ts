export type RedisSetResult = 'OK' | null;

export interface RedisClientLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<RedisSetResult>;
  set(
    key: string,
    value: string,
    expiryMode: 'PX',
    ttlMilliseconds: number,
    condition: 'NX',
  ): Promise<RedisSetResult>;
  setex(key: string, ttlSeconds: number, value: string): Promise<'OK'>;
  del(...keys: string[]): Promise<number>;
  exists(key: string): Promise<number>;
  eval(
    script: string,
    numberOfKeys: number,
    ...args: string[]
  ): Promise<unknown>;
  scan(
    cursor: string,
    matchToken: 'MATCH',
    pattern: string,
    countToken: 'COUNT',
    count: number,
  ): Promise<[string, string[]]>;
}
