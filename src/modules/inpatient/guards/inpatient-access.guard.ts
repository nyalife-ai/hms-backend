/**
 * File: inpatient-access.guard.ts
 * Module: inpatient
 * Purpose: Placeholder access guard for inpatient routes.
 */

import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class InpatientAccessGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: unknown }>();
    if (!req.user) throw new ForbiddenException('Authentication required');
    return true;
  }
}
