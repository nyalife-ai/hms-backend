import { Inject, Injectable } from '@nestjs/common';
import { IDENTITY_PROVIDER } from '../tokens/auth.tokens';
import type { AuthCredentials, AuthPrincipal } from '../tokens/token.types';
import type { IdentityProvider } from '../../identity/identity-provider.interface';
import type { AuthStrategy } from './auth-strategy.interface';

@Injectable()
export class OAuth2AuthStrategy implements AuthStrategy {
  public readonly name = 'oauth2';

  public constructor(
    @Inject(IDENTITY_PROVIDER) private readonly provider: IdentityProvider,
  ) {}

  public async validate(
    credentials: AuthCredentials,
  ): Promise<AuthPrincipal | null> {
    if (credentials.token) return this.provider.getUserInfo(credentials.token);
    if (!credentials.authorizationCode || !credentials.redirectUri) return null;
    const tokens = await this.provider.exchangeCode(
      credentials.authorizationCode,
      credentials.redirectUri,
    );
    return this.provider.getUserInfo(tokens.accessToken);
  }
}
