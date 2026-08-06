export type PresenceStatus = 'online' | 'offline';

export interface PresenceRecord {
  readonly userId: string;
  readonly tenantId?: string;
  readonly status: PresenceStatus;
  readonly lastSeenAt: Date;
  readonly connectionIds: readonly string[];
  readonly deviceCount: number;
}

export interface RealtimePresence {
  markOnline(userId: string, connectionId: string, tenantId?: string): void;
  markOffline(userId: string, connectionId: string): void;
  heartbeat(userId: string, connectionId: string): void;
  get(userId: string): PresenceRecord | undefined;
  isOnline(userId: string): boolean;
  listOnline(tenantId?: string): readonly PresenceRecord[];
  pruneStale(maxIdleMs: number, now?: Date): number;
}
