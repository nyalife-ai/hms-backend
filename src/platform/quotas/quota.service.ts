import type { QuotaStore } from './quota-store.interface';
import type {
  QuotaCheckResult,
  QuotaResource,
  QuotaUsage,
} from './quota.types';

export class QuotaExceededError extends Error {
  public constructor(
    public readonly tenantId: string,
    public readonly resource: QuotaResource,
    public readonly limit: number,
    public readonly attempted: number,
  ) {
    super(
      `Quota exceeded for tenant "${tenantId}" resource "${resource}": ` +
        `attempted ${attempted}, limit ${limit}`,
    );
    this.name = 'QuotaExceededError';
  }
}

export interface QuotaServiceOptions {
  readonly store: QuotaStore;
  /** Applied when a tenant/resource has no explicit limit. Unlimited when omitted. */
  readonly defaultLimit?: number;
}

/**
 * Enforces per-tenant resource quotas (storage, api_calls, bandwidth,
 * processing_time). All state is delegated to an injected {@link QuotaStore}
 * so callers can back it with an in-memory store (tests / single process) or
 * a durable one (DB/Redis) shared across workers. Composes conceptually with
 * the tenancy platform slice via plain `tenantId` string keys.
 */
export class QuotaService {
  public constructor(private readonly options: QuotaServiceOptions) {}

  public async setLimit(
    tenantId: string,
    resource: QuotaResource,
    limit: number,
  ): Promise<void> {
    if (!Number.isFinite(limit) || limit < 0) {
      throw new RangeError('Quota limit must be a non-negative finite number');
    }
    return this.options.store.setLimit(tenantId, resource, limit);
  }

  public async getUsage(
    tenantId: string,
    resource: QuotaResource,
  ): Promise<QuotaUsage> {
    const [used, limit] = await Promise.all([
      this.options.store.getUsage(tenantId, resource),
      this.resolveLimit(tenantId, resource),
    ]);
    return this.toUsage(tenantId, resource, used, limit);
  }

  /** Reports whether `amount` more units could be consumed, without mutating usage. */
  public async check(
    tenantId: string,
    resource: QuotaResource,
    amount = 1,
  ): Promise<QuotaCheckResult> {
    const usage = await this.getUsage(tenantId, resource);
    return { ...usage, allowed: usage.used + amount <= usage.limit };
  }

  /** Atomically consumes `amount` units, throwing {@link QuotaExceededError} when it would exceed the limit. */
  public async consume(
    tenantId: string,
    resource: QuotaResource,
    amount = 1,
  ): Promise<QuotaCheckResult> {
    this.assertPositiveAmount(amount, 'consume');
    const limit = await this.resolveLimit(tenantId, resource);
    const used = await this.options.store.getUsage(tenantId, resource);
    if (used + amount > limit) {
      throw new QuotaExceededError(tenantId, resource, limit, used + amount);
    }
    const nextUsed = await this.options.store.increment(
      tenantId,
      resource,
      amount,
    );
    return {
      ...this.toUsage(tenantId, resource, nextUsed, limit),
      allowed: true,
    };
  }

  /** Releases previously consumed units (e.g. freed storage, ended session). */
  public async release(
    tenantId: string,
    resource: QuotaResource,
    amount = 1,
  ): Promise<QuotaUsage> {
    this.assertPositiveAmount(amount, 'release');
    const nextUsed = await this.options.store.decrement(
      tenantId,
      resource,
      amount,
    );
    const limit = await this.resolveLimit(tenantId, resource);
    return this.toUsage(tenantId, resource, nextUsed, limit);
  }

  public reset(tenantId: string, resource: QuotaResource): Promise<void> {
    return this.options.store.reset(tenantId, resource);
  }

  private toUsage(
    tenantId: string,
    resource: QuotaResource,
    used: number,
    limit: number,
  ): QuotaUsage {
    return {
      tenantId,
      resource,
      used,
      limit,
      remaining: Math.max(0, limit - used),
    };
  }

  private async resolveLimit(
    tenantId: string,
    resource: QuotaResource,
  ): Promise<number> {
    const stored = await this.options.store.getLimit(tenantId, resource);
    if (stored !== undefined) {
      return stored;
    }
    return this.options.defaultLimit ?? Number.POSITIVE_INFINITY;
  }

  private assertPositiveAmount(amount: number, operation: string): void {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new RangeError(
        `Quota ${operation} amount must be a positive finite number`,
      );
    }
  }
}
