import type { SessionRecord } from './session.types';

export interface SessionStore {
  save(session: SessionRecord): Promise<void>;
  find(id: string): Promise<SessionRecord | null>;
  delete(id: string): Promise<void>;
  listByPrincipal(principalId: string): Promise<readonly SessionRecord[]>;
  deleteExpired(now: Date): Promise<number>;
}
