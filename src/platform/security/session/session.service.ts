import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DomainException } from '../../../core';
import { SESSION_STORE } from '../auth/tokens/auth.tokens';
import type { SessionStore } from './session.store.interface';
import type { SessionRecord } from './session.types';

export interface CreateSessionInput {
  readonly principalId: string;
  readonly roles?: readonly string[];
  readonly deviceId: string;
  readonly refreshToken: string;
  readonly ttlMs: number;
}

@Injectable()
export class SessionService {
  public constructor(
    @Inject(SESSION_STORE) private readonly store: SessionStore,
  ) {}

  public async create(input: CreateSessionInput): Promise<SessionRecord> {
    if (input.ttlMs <= 0)
      throw new DomainException('Session TTL must be positive');
    const now = new Date();
    const session: SessionRecord = {
      id: randomUUID(),
      principalId: input.principalId,
      roles: input.roles ?? [],
      deviceId: input.deviceId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + input.ttlMs),
      refreshTokenHash: this.hash(input.refreshToken),
      revoked: false,
    };
    await this.store.save(session);
    return session;
  }

  public async refresh(
    id: string,
    refreshToken: string,
    ttlMs: number,
  ): Promise<SessionRecord> {
    const session = await this.store.find(id);
    if (
      !session ||
      session.revoked ||
      session.expiresAt <= new Date() ||
      session.refreshTokenHash !== this.hash(refreshToken) ||
      ttlMs <= 0
    ) {
      throw new DomainException('Invalid session refresh');
    }
    const updated = { ...session, expiresAt: new Date(Date.now() + ttlMs) };
    await this.store.save(updated);
    return updated;
  }

  public async revoke(id: string): Promise<void> {
    const session = await this.store.find(id);
    if (session) await this.store.save({ ...session, revoked: true });
  }

  public cleanupExpired(now = new Date()): Promise<number> {
    return this.store.deleteExpired(now);
  }

  public listDevices(principalId: string): Promise<readonly SessionRecord[]> {
    return this.store.listByPrincipal(principalId);
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
