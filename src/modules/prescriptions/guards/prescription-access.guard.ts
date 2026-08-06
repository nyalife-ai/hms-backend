/**
 * File: prescription-access.guard.ts
 * Module: prescriptions
 * Purpose: Placeholder access guard for prescription routes.
 */

import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class PrescriptionAccessGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: unknown }>();
    if (!req.user) throw new ForbiddenException('Authentication required');
    return true;
  }
}
