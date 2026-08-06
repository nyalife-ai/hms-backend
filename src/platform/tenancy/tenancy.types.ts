export type TenantId = string;

export type TenantIsolationStrategy =
  'shared-database' | 'schema-per-tenant' | 'database-per-tenant';

export interface TenantConfiguration {
  readonly id: TenantId;
  readonly name: string;
  readonly isolation: TenantIsolationStrategy;
  readonly settings: Readonly<Record<string, unknown>>;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly connection?: Readonly<Record<string, unknown>>;
}

export type TenantResolutionStrategy = 'header' | 'subdomain' | 'explicit';

export interface TenantResolverOptions {
  readonly strategy: TenantResolutionStrategy;
  readonly headerName?: string;
  readonly baseDomain?: string;
}

export interface TenantRequestLike {
  readonly headers?: Readonly<
    Record<string, string | ReadonlyArray<string> | undefined>
  >;
  readonly hostname?: string;
  readonly host?: string;
  readonly explicitTenantId?: TenantId;
  readonly tenantId?: TenantId;
}

export interface TenantPrincipal {
  readonly id: string;
  readonly tenantId?: TenantId;
  readonly tenantIds?: readonly TenantId[];
}

export interface PrincipalTenantRequest extends TenantRequestLike {
  readonly principal?: Readonly<TenantPrincipal>;
  /** Authorized tenant attached by {@link TenantContextMiddleware}. */
  tenant?: Readonly<TenantConfiguration>;
}

export interface TenantAccessEvaluator {
  canAccess(
    principal: Readonly<TenantPrincipal>,
    tenant: Readonly<TenantConfiguration>,
    request: Readonly<PrincipalTenantRequest>,
  ): boolean | Promise<boolean>;
}

export interface SharedConnectionDescriptor {
  readonly isolation: 'shared-database';
  readonly connection: Readonly<Record<string, unknown>>;
}

export interface SchemaConnectionDescriptor {
  readonly isolation: 'schema-per-tenant';
  readonly tenantId: TenantId;
  readonly schema: string;
  readonly connection: Readonly<Record<string, unknown>>;
}

export interface DatabaseConnectionDescriptor {
  readonly isolation: 'database-per-tenant';
  readonly tenantId: TenantId;
  readonly database?: string;
  readonly url?: string;
  readonly connection: Readonly<Record<string, unknown>>;
}

export type TenantConnectionDescriptor =
  | SharedConnectionDescriptor
  | SchemaConnectionDescriptor
  | DatabaseConnectionDescriptor;
