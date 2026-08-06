import { Inject, Injectable } from '@nestjs/common';
import { DomainException } from '../../../../core';
import { TOKEN_SIGNER } from '../tokens/auth.tokens';
import type { AccessTokenPayload, TokenPair } from '../tokens/token.types';

export interface TokenSigner {
  sign(payload: AccessTokenPayload): Promise<string>;
  verify(token: string): Promise<AccessTokenPayload | null>;
  randomToken(): string;
}

@Injectable()
export class TokenService {
  public constructor(
    @Inject(TOKEN_SIGNER) private readonly signer: TokenSigner,
  ) {}

  public async issue(
    payload: Omit<AccessTokenPayload, 'issuedAt' | 'expiresAt'>,
    ttlSeconds: number,
  ): Promise<TokenPair> {
    if (ttlSeconds <= 0)
      throw new DomainException('Token TTL must be positive');
    const issuedAt = Math.floor(Date.now() / 1000);
    const complete: AccessTokenPayload = {
      ...payload,
      issuedAt,
      expiresAt: issuedAt + ttlSeconds,
    };
    return {
      accessToken: await this.signer.sign(complete),
      refreshToken: this.signer.randomToken(),
      expiresAt: new Date(complete.expiresAt * 1000),
    };
  }

  public async verify(token: string): Promise<AccessTokenPayload | null> {
    const payload = await this.signer.verify(token);
    return payload && payload.expiresAt > Math.floor(Date.now() / 1000)
      ? payload
      : null;
  }

  public refresh(
    refreshToken: string,
    payload: Omit<AccessTokenPayload, 'issuedAt' | 'expiresAt'>,
    ttlSeconds: number,
  ): Promise<TokenPair> {
    if (!refreshToken) throw new DomainException('Refresh token is required');
    return this.issue(payload, ttlSeconds);
  }
}
