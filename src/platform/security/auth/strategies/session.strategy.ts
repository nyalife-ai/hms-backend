import { Inject, Injectable } from '@nestjs/common';
import { SESSION_STORE } from '../tokens/auth.tokens';
import type { AuthCredentials, AuthPrincipal } from '../tokens/token.types';
import type { SessionStore } from '../../session/session.store.interface';
import type { AuthStrategy } from './auth-strategy.interface';

@Injectable()
export class SessionAuthStrategy implements AuthStrategy {
  public readonly name = 'session';

  public constructor(
    @Inject(SESSION_STORE) private readonly store: SessionStore,
  ) {}

  public async validate(
    credentials: AuthCredentials,
  ): Promise<AuthPrincipal | null> {
    if (!credentials.sessionId) return null;
    const session = await this.store.find(credentials.sessionId);
    if (
      !session ||
      session.revoked ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      return null;
    }
    return { id: session.principalId, roles: session.roles };
  }
}
