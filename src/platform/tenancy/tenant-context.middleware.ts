import { ForbiddenException, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { TenantContext } from './tenant-context';
import { TenantResolver } from './tenant-resolver';
import type {
  PrincipalTenantRequest,
  TenantAccessEvaluator,
  TenantConfiguration,
  TenantPrincipal,
} from './tenancy.types';

interface AuthorizedTenant {
  readonly tenant: Readonly<TenantConfiguration>;
  readonly principal: Readonly<TenantPrincipal>;
}

/**
 * Early Express-layer tenant binder: resolves and authorizes the tenant, attaches
 * `request.tenant`, then enters ALS via {@link TenantContext.run} around `next()`.
 *
 * ALS may not reliably propagate into later Nest async handlers after `next()`
 * returns, depending on Nest/Express scheduling. Prefer
 * {@link TenantContextInterceptor} (APP_INTERCEPTOR) as the request-lifecycle
 * binder; use this middleware for early Express-layer consumers that run inside
 * the `next()` call stack.
 */
export class TenantContextMiddleware implements NestMiddleware {
  public constructor(
    private readonly context: TenantContext,
    private readonly resolver: TenantResolver,
    private readonly evaluator: TenantAccessEvaluator,
  ) {}

  public use(
    request: PrincipalTenantRequest,
    _response: Response,
    next: NextFunction,
  ): void {
    void this.authorize(request)
      .then(({ tenant, principal }) => {
        request.tenant = tenant;
        this.context.run(tenant, () => next(), principal);
      })
      .catch(next);
  }

  private async authorize(
    request: Readonly<PrincipalTenantRequest>,
  ): Promise<AuthorizedTenant> {
    const principal = request.principal;
    if (!principal?.id.trim()) {
      throw new ForbiddenException('Authenticated principal is required');
    }

    let tenant: Readonly<TenantConfiguration>;
    try {
      tenant = this.resolver.resolve(request);
    } catch {
      throw new ForbiddenException('Tenant access is forbidden');
    }
    if (!(await this.evaluator.canAccess(principal, tenant, request))) {
      throw new ForbiddenException('Tenant access is forbidden');
    }
    return { tenant, principal };
  }
}
