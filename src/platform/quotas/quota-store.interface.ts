import type { QuotaResource } from './quota.types';

/**
 * Quota state port — platform defines the capability, infrastructure (or a
 * process-local default) implements it. Usage counters are keyed by
 * `(tenantId, resource)`, e.g. tenant A capped at 10GB storage while tenant B
 * is capped at 1TB.
 */
export interface QuotaStore {
  getLimit(
    tenantId: string,
    resource: QuotaResource,
  ): Promise<number | undefined>;
  setLimit(
    tenantId: string,
    resource: QuotaResource,
    limit: number,
  ): Promise<void>;
  getUsage(tenantId: string, resource: QuotaResource): Promise<number>;
  increment(
    tenantId: string,
    resource: QuotaResource,
    amount: number,
  ): Promise<number>;
  decrement(
    tenantId: string,
    resource: QuotaResource,
    amount: number,
  ): Promise<number>;
  reset(tenantId: string, resource: QuotaResource): Promise<void>;
}
