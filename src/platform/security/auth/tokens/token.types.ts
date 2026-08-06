export interface AccessTokenPayload {
  readonly subject: string;
  readonly roles: readonly string[];
  readonly permissions?: readonly string[];
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly sessionId?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface TokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: Date;
}

export interface AuthPrincipal {
  readonly id: string;
  readonly roles: readonly string[];
  readonly permissions?: readonly string[];
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface AuthCredentials {
  readonly token?: string;
  readonly apiKey?: string;
  readonly sessionId?: string;
  readonly authorizationCode?: string;
  readonly redirectUri?: string;
}
