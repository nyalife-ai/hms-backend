import type { RealtimeEvent } from '../events/realtime-event';
import type { RealtimeRoom } from '../contracts/realtime-room.interface';

export interface RoomRegistryLimits {
  readonly maxRooms?: number;
  readonly maxConnectionsPerRoom?: number;
}

/**
 * Generic room membership registry used by gateways and local providers.
 */
export class RoomRegistry {
  private readonly rooms = new Map<string, Set<string>>();
  private readonly maxRooms: number;
  private readonly maxConnectionsPerRoom: number;

  public constructor(limits: RoomRegistryLimits = {}) {
    this.maxRooms = limits.maxRooms ?? 10_000;
    this.maxConnectionsPerRoom = limits.maxConnectionsPerRoom ?? 1_000;
  }

  public getRoom(name: string): RealtimeRoom {
    const normalized = name.trim();
    if (!normalized) {
      throw new RangeError('Room name must be a non-empty string');
    }
    return {
      name: normalized,
      join: (connectionId: string) =>
        Promise.resolve(this.join(normalized, connectionId)),
      leave: (connectionId: string) =>
        Promise.resolve(this.leave(normalized, connectionId)),
      broadcast: (event: RealtimeEvent) => {
        void event;
        return Promise.resolve(this.memberCount(normalized));
      },
      memberCount: () => this.memberCount(normalized),
      members: () => this.members(normalized),
    };
  }

  public join(room: string, connectionId: string): boolean {
    const normalized = room.trim();
    if (!normalized || !connectionId.trim()) return false;
    let members = this.rooms.get(normalized);
    if (!members) {
      if (this.rooms.size >= this.maxRooms) return false;
      members = new Set();
      this.rooms.set(normalized, members);
    }
    if (
      !members.has(connectionId) &&
      members.size >= this.maxConnectionsPerRoom
    ) {
      return false;
    }
    members.add(connectionId);
    return true;
  }

  public leave(room: string, connectionId: string): boolean {
    const members = this.rooms.get(room.trim());
    if (!members) return false;
    const removed = members.delete(connectionId);
    if (members.size === 0) this.rooms.delete(room.trim());
    return removed;
  }

  public leaveAll(connectionId: string): number {
    let removed = 0;
    for (const [room, members] of [...this.rooms]) {
      if (!members.delete(connectionId)) continue;
      removed += 1;
      if (members.size === 0) this.rooms.delete(room);
    }
    return removed;
  }

  public memberCount(room: string): number {
    return this.rooms.get(room.trim())?.size ?? 0;
  }

  public members(room: string): readonly string[] {
    return [...(this.rooms.get(room.trim()) ?? [])];
  }

  public roomCount(): number {
    return this.rooms.size;
  }

  public listRooms(): readonly string[] {
    return [...this.rooms.keys()];
  }

  public async broadcast(
    room: string,
    event: RealtimeEvent,
    send: (connectionId: string, event: RealtimeEvent) => Promise<void>,
  ): Promise<number> {
    const members = this.members(room);
    await Promise.all(members.map((id) => send(id, event)));
    return members.length;
  }
}
