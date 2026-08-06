/**
 * File: bed-access.guard.ts
 * Module: beds
 * Purpose: Placeholder access guard for bed routes.
 */

import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class BedAccessGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: unknown }>();
    if (!req.user) throw new ForbiddenException('Authentication required');
    return true;
  }
}
