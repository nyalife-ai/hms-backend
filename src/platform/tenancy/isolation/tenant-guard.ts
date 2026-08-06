import {
  ForbiddenException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { TenantContext } from '../tenant-context';
import { TenantResolver } from '../tenant-resolver';
import type {
  PrincipalTenantRequest,
  TenantAccessEvaluator,
} from '../tenancy.types';

export class TenantGuard implements CanActivate {
  public constructor(
    private readonly context: TenantContext,
    private readonly resolver: TenantResolver,
    private readonly evaluator: TenantAccessEvaluator,
  ) {}

  public async canActivate(
    executionContext: ExecutionContext,
  ): Promise<boolean> {
    const activeTenant = this.context.current();
    const activePrincipal = this.context.currentPrincipal();
    if (!activeTenant || !activePrincipal) {
      throw new ForbiddenException('No active tenant context');
    }

    const request = executionContext
      .switchToHttp()
      .getRequest<PrincipalTenantRequest>();
    const principal = request.principal;
    if (!principal || principal.id !== activePrincipal.id) {
      throw new ForbiddenException('Tenant principal mismatch');
    }

    let requestTenant;
    try {
      requestTenant = this.resolver.resolve(request);
    } catch {
      throw new ForbiddenException('Tenant access is forbidden');
    }
    if (
      requestTenant.id !== activeTenant.id ||
      !(await this.evaluator.canAccess(principal, requestTenant, request))
    ) {
      throw new ForbiddenException('Cross-tenant access is forbidden');
    }
    return true;
  }
}
