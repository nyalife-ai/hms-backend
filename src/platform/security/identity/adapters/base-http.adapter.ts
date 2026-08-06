import { DomainException } from '../../../../core';
import type { AuthPrincipal, TokenPair } from '../../auth/tokens/token.types';
import type {
  IdentityProvider,
  IdentityProviderConfig,
  IdentityProviderCredentials,
  IdentityProviderHttpClient,
} from '../identity-provider.interface';

interface ProviderTokenResponse {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly expires_in: number;
}

/**
 * HTTP-backed identity provider.
 *
 * Prefer OAuth 2.0 Authorization Code + PKCE ({@link exchangeCode}) over the
 * Resource Owner Password Credentials grant. ROPC is disabled unless
 * `config.enablePasswordGrant === true`.
 */
export abstract class HttpIdentityProvider implements IdentityProvider {
  protected abstract readonly tokenPath: string;
  protected abstract readonly userInfoPath: string;

  public constructor(
    protected readonly config: IdentityProviderConfig,
    protected readonly http: IdentityProviderHttpClient,
  ) {}

  public async authenticate(
    credentials: IdentityProviderCredentials,
  ): Promise<AuthPrincipal | null> {
    if (credentials.token) return this.getUserInfo(credentials.token);
    if (!credentials.username || !credentials.password) return null;
    if (this.config.enablePasswordGrant !== true) {
      throw new DomainException(
        'Resource Owner Password Credentials (ROPC) grant is disabled. Prefer OAuth authorization-code + PKCE (exchangeCode), or set enablePasswordGrant: true explicitly for trusted first-party clients.',
      );
    }
    const tokens = await this.requestTokens({
      grant_type: 'password',
      username: credentials.username,
      password: credentials.password,
    });
    return this.getUserInfo(tokens.accessToken);
  }

  public async getUserInfo(accessToken: string): Promise<AuthPrincipal | null> {
    return this.http.request<AuthPrincipal | null>({
      method: 'GET',
      url: `${this.config.baseUrl}${this.userInfoPath}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
  }

  public exchangeCode(code: string, redirectUri: string): Promise<TokenPair> {
    if (!code || !redirectUri) {
      throw new DomainException(
        'Authorization code and redirect URI are required',
      );
    }
    return this.requestTokens({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });
  }

  private async requestTokens(
    values: Readonly<Record<string, string>>,
  ): Promise<TokenPair> {
    const response = await this.http.request<ProviderTokenResponse>({
      method: 'POST',
      url: `${this.config.baseUrl}${this.tokenPath}`,
      body: {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        ...values,
      },
    });
    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresAt: new Date(Date.now() + response.expires_in * 1000),
    };
  }
}
