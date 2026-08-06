/**
 * File: admission-access.guard.ts
 * Module: admissions
 * Purpose: Placeholder access guard for admission routes.
 */

import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class AdmissionAccessGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: unknown }>();
    if (!req.user) throw new ForbiddenException('Authentication required');
    return true;
  }
}
