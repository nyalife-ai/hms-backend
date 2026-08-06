import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

type AuthenticatedRequest = Request & {
  user?: Record<string, unknown>;
};

/**
 * Extracts the authenticated user (or a specific property) from the request.
 *
 * Relies on an auth guard having previously attached `request.user`.
 *
 * @example
 * ```typescript
 * @Get('me')
 * getProfile(@CurrentUser() user: AuthenticatedUser) { ... }
 *
 * @Get('me/id')
 * getId(@CurrentUser('id') userId: string) { ... }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext): unknown => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      return undefined;
    }

    if (!data) {
      return user;
    }

    return Object.prototype.hasOwnProperty.call(user, data)
      ? user[data]
      : undefined;
  },
);
