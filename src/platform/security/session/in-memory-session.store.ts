import { Injectable } from '@nestjs/common';
import type { SessionStore } from './session.store.interface';
import type { SessionRecord } from './session.types';

@Injectable()
export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  public save(session: SessionRecord): Promise<void> {
    this.sessions.set(session.id, session);
    return Promise.resolve();
  }

  public find(id: string): Promise<SessionRecord | null> {
    return Promise.resolve(this.sessions.get(id) ?? null);
  }

  public delete(id: string): Promise<void> {
    this.sessions.delete(id);
    return Promise.resolve();
  }

  public listByPrincipal(
    principalId: string,
  ): Promise<readonly SessionRecord[]> {
    return Promise.resolve(
      [...this.sessions.values()].filter(
        (session) => session.principalId === principalId,
      ),
    );
  }

  public deleteExpired(now: Date): Promise<number> {
    let deleted = 0;
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) {
        this.sessions.delete(id);
        deleted += 1;
      }
    }
    return Promise.resolve(deleted);
  }
}
