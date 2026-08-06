import { Inject, Injectable } from '@nestjs/common';
import { JWT_VERIFIER } from '../tokens/auth.tokens';
import type {
  AccessTokenPayload,
  AuthCredentials,
  AuthPrincipal,
} from '../tokens/token.types';
import type { AuthStrategy } from './auth-strategy.interface';

export interface JwtVerifier {
  verify(token: string): Promise<AccessTokenPayload | null>;
}

@Injectable()
export class JwtAuthStrategy implements AuthStrategy {
  public readonly name = 'jwt';

  public constructor(
    @Inject(JWT_VERIFIER) private readonly verifier: JwtVerifier,
  ) {}

  public async validate(
    credentials: AuthCredentials,
  ): Promise<AuthPrincipal | null> {
    if (!credentials.token) return null;
    const payload = await this.verifier.verify(credentials.token);
    if (!payload || payload.expiresAt <= Math.floor(Date.now() / 1000))
      return null;
    return {
      id: payload.subject,
      roles: payload.roles,
      permissions: payload.permissions,
      attributes: payload.attributes,
    };
  }
}
