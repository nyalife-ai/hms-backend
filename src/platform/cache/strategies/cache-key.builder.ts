import { createHash } from 'node:crypto';
import { TenantContext } from '../../tenancy/tenant-context';

export type CacheKeyPart =
  string | number | boolean | null | undefined | object;

export interface CacheKeyTenancyOptions {
  readonly enabled: boolean;
  readonly context?: TenantContext;
  readonly includePrincipal?: boolean;
}

export class CacheKeyBuilder {
  private readonly namespace: string;

  public constructor(
    namespace = 'cache',
    private readonly tenancy: Readonly<CacheKeyTenancyOptions> = {
      enabled: false,
    },
  ) {
    this.namespace = namespace.replace(/:+$/u, '');
  }

  public build(parts: readonly CacheKeyPart[]): string {
    const normalized = [...this.scopeParts(), ...parts]
      .map((part) => this.serialize(part))
      .join('|');
    const hash = createHash('sha256').update(normalized).digest('hex');
    return `${this.namespace}:${hash}`;
  }

  public namespaceExplicitKey(key: string): string {
    return this.tenancy.enabled ? this.build([key]) : key;
  }

  private scopeParts(): readonly CacheKeyPart[] {
    if (!this.tenancy.enabled) {
      return [];
    }
    const context = this.tenancy.context;
    if (!context) {
      throw new Error('Tenant context is required for cache access');
    }
    const tenant = context.current();
    if (!tenant) {
      throw new Error('Tenant context is required for cache access');
    }
    if (!this.tenancy.includePrincipal) {
      return [{ tenantId: tenant.id }];
    }
    const principal = context.currentPrincipal();
    if (!principal?.id) {
      throw new Error('Principal context is required for cache access');
    }
    return [{ tenantId: tenant.id, principalId: principal.id }];
  }

  private serialize(value: CacheKeyPart): string {
    if (value === undefined) {
      return 'undefined';
    }
    if (value !== null && typeof value === 'object') {
      return JSON.stringify(this.sortObject(value));
    }
    return JSON.stringify(value);
  }

  private sortObject(value: object): unknown {
    if (Array.isArray(value)) {
      return value.map((item: unknown) =>
        item !== null && typeof item === 'object'
          ? this.sortObject(item)
          : item,
      );
    }
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        const item = (value as Record<string, unknown>)[key];
        result[key] =
          item !== null && typeof item === 'object'
            ? this.sortObject(item)
            : item;
        return result;
      }, {});
  }
}
