import {
  HttpException,
  HttpStatus,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { QuotaExceededError, QuotaService } from './quota.service';
import type { QuotaResource } from './quota.types';

export interface QuotaRequestLike {
  readonly tenantId?: string;
  readonly tenant?: { readonly id?: string };
}

export interface QuotaGuardOptions {
  readonly resource: QuotaResource;
  /** Units consumed per allowed request. Defaults to 1. */
  readonly amount?: number;
  /** Extracts the tenant id from the request. Defaults to `request.tenantId ?? request.tenant?.id`. */
  readonly tenantIdExtractor?: (
    request: QuotaRequestLike,
  ) => string | undefined;
}

/**
 * Optional Nest guard enforcing a per-tenant quota before a route handler
 * runs. Consumes quota on every allowed request — pair with
 * {@link QuotaService.release} for resources that are reclaimed later (e.g.
 * storage freed on delete). Not registered globally; wire it per-route with
 * `@UseGuards(new QuotaGuard(quotaService, { resource: 'api_calls' }))` or an
 * equivalent factory provider.
 */
export class QuotaGuard implements CanActivate {
  public constructor(
    private readonly quotaService: QuotaService,
    private readonly options: QuotaGuardOptions,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<QuotaRequestLike>();
    const tenantId =
      this.options.tenantIdExtractor?.(request) ??
      request.tenantId ??
      request.tenant?.id;
    if (!tenantId) {
      throw new HttpException(
        'Tenant context is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      await this.quotaService.consume(
        tenantId,
        this.options.resource,
        this.options.amount ?? 1,
      );
      return true;
    } catch (error) {
      if (error instanceof QuotaExceededError) {
        throw new HttpException(error.message, HttpStatus.TOO_MANY_REQUESTS);
      }
      throw error;
    }
  }
}
