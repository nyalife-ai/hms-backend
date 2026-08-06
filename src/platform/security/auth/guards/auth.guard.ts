import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthenticationService } from '../services/authentication.service';
import {
  AUTH_STRATEGY_METADATA,
  DEFAULT_AUTH_STRATEGY,
} from '../tokens/auth.tokens';
import type { AuthCredentials, AuthPrincipal } from '../tokens/token.types';

interface AuthenticatedRequest extends Request {
  user?: AuthPrincipal;
}

@Injectable()
export class AuthGuard implements CanActivate {
  public constructor(
    private readonly reflector: Reflector,
    private readonly authentication: AuthenticationService,
    @Inject(DEFAULT_AUTH_STRATEGY) private readonly defaultStrategy: string,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const strategy =
      this.reflector.getAllAndOverride<string>(AUTH_STRATEGY_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) ?? this.defaultStrategy;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const credentials: AuthCredentials = {
      token: authorization?.startsWith('Bearer ')
        ? authorization.slice(7)
        : undefined,
      apiKey: this.single(request.headers['x-api-key']),
      sessionId: this.single(request.headers['x-session-id']),
    };
    const principal = await this.authentication.authenticate(
      strategy,
      credentials,
    );
    if (!principal) throw new UnauthorizedException('Authentication failed');
    request.user = principal;
    return true;
  }

  private single(
    value: string | readonly string[] | undefined,
  ): string | undefined {
    return typeof value === 'string' ? value : value?.[0];
  }
}
