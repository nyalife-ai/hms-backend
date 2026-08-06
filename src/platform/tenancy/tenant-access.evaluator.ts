import type {
  PrincipalTenantRequest,
  TenantAccessEvaluator,
  TenantConfiguration,
  TenantPrincipal,
} from './tenancy.types';

export const TENANT_ACCESS_EVALUATOR = Symbol('TENANT_ACCESS_EVALUATOR');

export class PrincipalTenantAccessEvaluator implements TenantAccessEvaluator {
  public canAccess(
    principal: Readonly<TenantPrincipal>,
    tenant: Readonly<TenantConfiguration>,
    request: Readonly<PrincipalTenantRequest>,
  ): boolean {
    void request;
    return (
      principal.tenantId === tenant.id ||
      principal.tenantIds?.includes(tenant.id) === true
    );
  }
}
