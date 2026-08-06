/**
 * File: radiology-access.guard.ts
 * Module: radiology
 * Purpose: Placeholder access guard for radiology routes.
 */

import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class RadiologyAccessGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: unknown }>();
    if (!req.user) throw new ForbiddenException('Authentication required');
    return true;
  }
}
