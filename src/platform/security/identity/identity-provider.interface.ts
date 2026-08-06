import type { AuthPrincipal, TokenPair } from '../auth/tokens/token.types';

export interface IdentityProviderCredentials {
  readonly username?: string;
  readonly password?: string;
  readonly token?: string;
}

export interface IdentityProviderHttpRequest {
  readonly method: 'GET' | 'POST';
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: Readonly<Record<string, string>>;
}

export interface IdentityProviderHttpClient {
  request<T>(request: IdentityProviderHttpRequest): Promise<T>;
}

export interface IdentityProvider {
  authenticate(
    credentials: IdentityProviderCredentials,
  ): Promise<AuthPrincipal | null>;
  getUserInfo(accessToken: string): Promise<AuthPrincipal | null>;
  exchangeCode(code: string, redirectUri: string): Promise<TokenPair>;
}

export interface IdentityProviderConfig {
  readonly baseUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly tenant?: string;
  /**
   * Enable the Resource Owner Password Credentials (ROPC) grant for
   * username/password authentication.
   *
   * **Disabled by default** (including production). Prefer the OAuth 2.0
   * Authorization Code flow with PKCE via {@link IdentityProvider.exchangeCode}.
   * Only enable ROPC for trusted first-party clients that cannot use a browser.
   */
  readonly enablePasswordGrant?: boolean;
}
