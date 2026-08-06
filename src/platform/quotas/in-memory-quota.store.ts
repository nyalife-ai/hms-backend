import type { QuotaStore } from './quota-store.interface';
import type { QuotaResource } from './quota.types';

/**
 * Process-local quota store for tests and single-process deployments. Not
 * durable — replace with a persisted store (DB/Redis) to share quota state
 * across multiple workers/processes.
 */
export class InMemoryQuotaStore implements QuotaStore {
  private readonly limits = new Map<string, number>();
  private readonly usage = new Map<string, number>();

  public getLimit(
    tenantId: string,
    resource: QuotaResource,
  ): Promise<number | undefined> {
    return Promise.resolve(this.limits.get(this.key(tenantId, resource)));
  }

  public setLimit(
    tenantId: string,
    resource: QuotaResource,
    limit: number,
  ): Promise<void> {
    this.limits.set(this.key(tenantId, resource), limit);
    return Promise.resolve();
  }

  public getUsage(tenantId: string, resource: QuotaResource): Promise<number> {
    return Promise.resolve(this.usage.get(this.key(tenantId, resource)) ?? 0);
  }

  public increment(
    tenantId: string,
    resource: QuotaResource,
    amount: number,
  ): Promise<number> {
    const key = this.key(tenantId, resource);
    const next = (this.usage.get(key) ?? 0) + amount;
    this.usage.set(key, next);
    return Promise.resolve(next);
  }

  public decrement(
    tenantId: string,
    resource: QuotaResource,
    amount: number,
  ): Promise<number> {
    const key = this.key(tenantId, resource);
    const next = Math.max(0, (this.usage.get(key) ?? 0) - amount);
    this.usage.set(key, next);
    return Promise.resolve(next);
  }

  public reset(tenantId: string, resource: QuotaResource): Promise<void> {
    this.usage.delete(this.key(tenantId, resource));
    return Promise.resolve();
  }

  private key(tenantId: string, resource: QuotaResource): string {
    return `${tenantId}:${resource}`;
  }
}
