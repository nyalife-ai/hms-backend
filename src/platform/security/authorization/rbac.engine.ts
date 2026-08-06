import { Injectable } from '@nestjs/common';
import type { Action, Permission, Principal, Resource } from './types';

@Injectable()
export class RbacEngine {
  private readonly permissions = new Map<string, readonly Permission[]>();

  public setRolePermissions(
    role: string,
    permissions: readonly Permission[],
  ): void {
    this.permissions.set(role, [...permissions]);
  }

  public can(
    principal: Principal,
    action: Action,
    resource: Resource,
  ): boolean {
    return principal.roles.some((role) =>
      (this.permissions.get(role) ?? []).some(
        (permission) =>
          (permission.action === action || permission.action === '*') &&
          (permission.resource === resource || permission.resource === '*'),
      ),
    );
  }
}
