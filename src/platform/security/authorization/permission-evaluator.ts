import { Injectable } from '@nestjs/common';
import { AbacEngine } from './abac.engine';
import { RbacEngine } from './rbac.engine';
import type { AuthorizationContext } from './types';

@Injectable()
export class PermissionEvaluator {
  public constructor(
    private readonly rbac: RbacEngine,
    private readonly abac: AbacEngine,
  ) {}

  public async can(context: AuthorizationContext): Promise<boolean> {
    return (
      this.rbac.can(context.principal, context.action, context.resource) ||
      this.abac.can(context)
    );
  }
}
