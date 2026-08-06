import { ValidationException } from '../../../core';
import type {
  TenantConfiguration,
  TenantConnectionDescriptor,
  TenantIsolationStrategy,
} from '../tenancy.types';

export class ConnectionResolver {
  public constructor(
    private readonly sharedConnection: Readonly<Record<string, unknown>> = {},
  ) {}

  public resolve(
    tenant: Readonly<TenantConfiguration>,
    strategy: TenantIsolationStrategy = tenant.isolation,
  ): TenantConnectionDescriptor {
    if (strategy !== tenant.isolation) {
      throw new ValidationException(
        `Isolation strategy '${strategy}' does not match tenant '${tenant.id}'`,
      );
    }

    const connection = tenant.connection ?? {};
    this.assertOwnedByTenant(connection, tenant.id);

    switch (strategy) {
      case 'shared-database':
        return Object.freeze({
          isolation: strategy,
          connection: this.sharedConnection,
        });
      case 'schema-per-tenant':
        return Object.freeze({
          isolation: strategy,
          tenantId: tenant.id,
          schema: this.stringValue(connection.schema) ?? tenant.id,
          connection,
        });
      case 'database-per-tenant':
        return Object.freeze({
          isolation: strategy,
          tenantId: tenant.id,
          database: this.stringValue(connection.database) ?? tenant.id,
          url: this.stringValue(connection.url),
          connection,
        });
    }
  }

  private assertOwnedByTenant(
    connection: Readonly<Record<string, unknown>>,
    tenantId: string,
  ): void {
    const owner = connection.tenantId;
    if (owner !== undefined && owner !== tenantId) {
      const ownerLabel =
        typeof owner === 'string' ||
        typeof owner === 'number' ||
        typeof owner === 'boolean' ||
        typeof owner === 'bigint'
          ? String(owner)
          : JSON.stringify(owner);
      throw new ValidationException(
        `Connection descriptor belongs to tenant '${ownerLabel}'`,
      );
    }
  }

  private stringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
