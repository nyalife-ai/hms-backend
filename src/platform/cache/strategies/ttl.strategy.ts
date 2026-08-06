export interface TtlStrategyOptions {
  readonly defaultTtlSeconds?: number;
  readonly minimumTtlSeconds?: number;
  readonly maximumTtlSeconds?: number;
}

export class TtlStrategy {
  public constructor(private readonly options: TtlStrategyOptions = {}) {}

  public resolve(requestedTtlSeconds?: number): number | undefined {
    const ttl = requestedTtlSeconds ?? this.options.defaultTtlSeconds;
    if (ttl === undefined) {
      return undefined;
    }
    if (!Number.isFinite(ttl) || ttl <= 0) {
      return 0;
    }
    const minimum = this.options.minimumTtlSeconds ?? ttl;
    const maximum = this.options.maximumTtlSeconds ?? ttl;
    return Math.min(Math.max(ttl, minimum), maximum);
  }
}
