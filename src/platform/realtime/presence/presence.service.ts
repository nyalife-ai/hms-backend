import type {
  PresenceRecord,
  PresenceStatus,
  RealtimePresence,
} from '../contracts/realtime-presence.interface';

interface MutablePresence {
  userId: string;
  tenantId?: string;
  status: PresenceStatus;
  lastSeenAt: Date;
  connectionIds: Set<string>;
}

export class PresenceService implements RealtimePresence {
  private readonly records = new Map<string, MutablePresence>();

  public markOnline(
    userId: string,
    connectionId: string,
    tenantId?: string,
  ): void {
    if (!userId.trim() || !connectionId.trim()) return;
    const existing = this.records.get(userId);
    if (existing) {
      existing.connectionIds.add(connectionId);
      existing.status = 'online';
      existing.lastSeenAt = new Date();
      if (tenantId) existing.tenantId = tenantId;
      return;
    }
    this.records.set(userId, {
      userId,
      tenantId,
      status: 'online',
      lastSeenAt: new Date(),
      connectionIds: new Set([connectionId]),
    });
  }

  public markOffline(userId: string, connectionId: string): void {
    const existing = this.records.get(userId);
    if (!existing) return;
    existing.connectionIds.delete(connectionId);
    existing.lastSeenAt = new Date();
    if (existing.connectionIds.size === 0) {
      existing.status = 'offline';
    }
  }

  public heartbeat(userId: string, connectionId: string): void {
    const existing = this.records.get(userId);
    if (!existing || !existing.connectionIds.has(connectionId)) return;
    existing.lastSeenAt = new Date();
    existing.status = 'online';
  }

  public get(userId: string): PresenceRecord | undefined {
    const existing = this.records.get(userId);
    if (!existing) return undefined;
    return this.toRecord(existing);
  }

  public isOnline(userId: string): boolean {
    return this.records.get(userId)?.status === 'online';
  }

  public listOnline(tenantId?: string): readonly PresenceRecord[] {
    return [...this.records.values()]
      .filter(
        (record) =>
          record.status === 'online' &&
          (tenantId === undefined || record.tenantId === tenantId),
      )
      .map((record) => this.toRecord(record));
  }

  public pruneStale(maxIdleMs: number, now: Date = new Date()): number {
    if (!Number.isSafeInteger(maxIdleMs) || maxIdleMs <= 0) {
      throw new RangeError('maxIdleMs must be a positive safe integer');
    }
    let pruned = 0;
    for (const [userId, record] of this.records) {
      const idle = now.getTime() - record.lastSeenAt.getTime();
      if (idle <= maxIdleMs) continue;
      if (record.status === 'online') {
        record.status = 'offline';
        record.connectionIds.clear();
        pruned += 1;
      } else if (idle > maxIdleMs * 2) {
        this.records.delete(userId);
        pruned += 1;
      }
    }
    return pruned;
  }

  private toRecord(record: MutablePresence): PresenceRecord {
    return {
      userId: record.userId,
      tenantId: record.tenantId,
      status: record.status,
      lastSeenAt: record.lastSeenAt,
      connectionIds: [...record.connectionIds],
      deviceCount: record.connectionIds.size,
    };
  }
}
