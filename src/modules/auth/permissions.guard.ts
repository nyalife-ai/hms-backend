import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './permissions.decorator';
import type { AuthUserPublic } from './auth.types';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthUserPublic }>();
    const user = request.user;
    const granted = user?.permissions ?? [];

    if (
      !user ||
      (!granted.includes('*') &&
        !required.some((perm) => granted.includes(perm)))
    ) {
      throw new ForbiddenException(
        'Missing required permission for this resource',
      );
    }
    return true;
  }
}
