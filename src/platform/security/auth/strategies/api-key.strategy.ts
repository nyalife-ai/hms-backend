import { Inject, Injectable } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { API_KEY_STORE } from '../tokens/auth.tokens';
import type { AuthCredentials, AuthPrincipal } from '../tokens/token.types';
import type { AuthStrategy } from './auth-strategy.interface';

export interface ApiKeyRecord {
  readonly hash: string;
  readonly principal: AuthPrincipal;
  readonly active: boolean;
}

export interface ApiKeyStore {
  findByHash(hash: string): Promise<ApiKeyRecord | null>;
}

@Injectable()
export class ApiKeyAuthStrategy implements AuthStrategy {
  public readonly name = 'api-key';

  public constructor(
    @Inject(API_KEY_STORE) private readonly store: ApiKeyStore,
  ) {}

  public async validate(
    credentials: AuthCredentials,
  ): Promise<AuthPrincipal | null> {
    if (!credentials.apiKey) return null;
    const hash = createHash('sha256').update(credentials.apiKey).digest('hex');
    const record = await this.store.findByHash(hash);
    if (!record?.active) return null;
    const actual = Buffer.from(hash);
    const expected = Buffer.from(record.hash);
    return actual.length === expected.length &&
      timingSafeEqual(actual, expected)
      ? record.principal
      : null;
  }
}
