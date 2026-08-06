import {
  ForbiddenException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Observable, from, switchMap } from 'rxjs';
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

export class TenantContextInterceptor implements NestInterceptor {
  public constructor(
    private readonly context: TenantContext,
    private readonly resolver: TenantResolver,
    private readonly evaluator: TenantAccessEvaluator,
  ) {}

  public intercept(
    executionContext: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const request = executionContext
      .switchToHttp()
      .getRequest<PrincipalTenantRequest>();
    return from(this.authorize(request)).pipe(
      switchMap(
        ({ tenant, principal }) =>
          new Observable((subscriber) =>
            this.context.run(
              tenant,
              () => next.handle().subscribe(subscriber),
              principal,
            ),
          ),
      ),
    );
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
