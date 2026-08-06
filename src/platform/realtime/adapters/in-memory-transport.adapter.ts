import type {
  RealtimeConnectionRegistration,
  RealtimeProvider,
} from '../contracts/realtime-provider.interface';
import type { RealtimeConnectionSnapshot } from '../contracts/realtime-connection.interface';
import type { RealtimeEvent } from '../events/realtime-event';
import type { RealtimeSerializer } from '../contracts/realtime-serializer.interface';
import { JsonRealtimeSerializer } from '../events/json-realtime.serializer';

interface BoundConnection {
  readonly registration: RealtimeConnectionRegistration;
  readonly rooms: Set<string>;
  readonly connectedAt: Date;
  lastHeartbeatAt: Date;
}

export interface InMemoryTransportLimits {
  readonly maxConnections?: number;
  readonly maxRooms?: number;
  readonly maxConnectionsPerRoom?: number;
}

/**
 * Shared in-process fan-out used by nest-ws / socketio / sse providers.
 * External socket libraries only need to register send/close adapters.
 */
export class InMemoryTransportAdapter implements RealtimeProvider {
  public readonly name: string;
  private readonly connections = new Map<string, BoundConnection>();
  private readonly rooms = new Map<string, Set<string>>();
  private readonly userIndex = new Map<string, Set<string>>();
  private readonly maxConnections: number;
  private readonly maxRooms: number;
  private readonly maxConnectionsPerRoom: number;
  private readonly serializer: RealtimeSerializer;
  private started = false;

  public constructor(
    name: string,
    limits: InMemoryTransportLimits = {},
    serializer: RealtimeSerializer = new JsonRealtimeSerializer(),
  ) {
    this.name = name;
    this.maxConnections = limits.maxConnections ?? 10_000;
    this.maxRooms = limits.maxRooms ?? 10_000;
    this.maxConnectionsPerRoom = limits.maxConnectionsPerRoom ?? 1_000;
    this.serializer = serializer;
  }

  public async connect(): Promise<void> {
    this.started = true;
    await Promise.resolve();
  }

  public async disconnect(): Promise<void> {
    const ids = [...this.connections.keys()];
    for (const id of ids) {
      await this.disconnectConnection(id, 'provider-shutdown');
    }
    this.started = false;
  }

  public async registerConnection(
    connection: RealtimeConnectionRegistration,
  ): Promise<boolean> {
    await Promise.resolve();
    if (
      !connection.id.trim() ||
      this.connections.has(connection.id) ||
      this.connections.size >= this.maxConnections
    ) {
      return false;
    }
    const now = new Date();
    this.connections.set(connection.id, {
      registration: connection,
      rooms: new Set(),
      connectedAt: now,
      lastHeartbeatAt: now,
    });
    if (connection.userId) {
      const set = this.userIndex.get(connection.userId) ?? new Set<string>();
      set.add(connection.id);
      this.userIndex.set(connection.userId, set);
    }
    return true;
  }

  public heartbeat(connectionId: string): boolean {
    const bound = this.connections.get(connectionId);
    if (!bound) return false;
    bound.lastHeartbeatAt = new Date();
    return true;
  }

  public async publish(event: RealtimeEvent): Promise<void> {
    await this.broadcast(event);
  }

  public async publishToUser(
    userId: string,
    event: RealtimeEvent,
  ): Promise<void> {
    const ids = this.userIndex.get(userId);
    if (!ids) return;
    await Promise.all([...ids].map((id) => this.sendToConnection(id, event)));
  }

  public async publishToRoom(
    room: string,
    event: RealtimeEvent,
  ): Promise<void> {
    const members = this.rooms.get(this.normalizeRoom(room));
    if (!members) return;
    await Promise.all(
      [...members].map((id) => this.sendToConnection(id, event)),
    );
  }

  public async broadcast(event: RealtimeEvent): Promise<void> {
    await Promise.all(
      [...this.connections.keys()].map((id) =>
        this.sendToConnection(id, event),
      ),
    );
  }

  public async joinRoom(connectionId: string, room: string): Promise<boolean> {
    await Promise.resolve();
    const bound = this.connections.get(connectionId);
    const normalized = this.normalizeRoom(room);
    if (!bound || !normalized) return false;
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
    bound.rooms.add(normalized);
    return true;
  }

  public async leaveRoom(connectionId: string, room: string): Promise<boolean> {
    await Promise.resolve();
    const bound = this.connections.get(connectionId);
    const normalized = this.normalizeRoom(room);
    if (!bound || !normalized) {
      return false;
    }
    bound.rooms.delete(normalized);
    if (!this.rooms.has(normalized)) {
      return false;
    }
    const members = this.rooms.get(normalized)!;
    members.delete(connectionId);
    if (members.size === 0) {
      this.rooms.delete(normalized);
    }
    return true;
  }

  public async disconnectConnection(
    connectionId: string,
    reason?: string,
  ): Promise<boolean> {
    const bound = this.connections.get(connectionId);
    if (!bound) return false;
    this.connections.delete(connectionId);
    for (const room of [...bound.rooms]) {
      const members = this.rooms.get(room);
      if (members) {
        members.delete(connectionId);
        if (members.size === 0) this.rooms.delete(room);
      }
    }
    const userId = bound.registration.userId;
    if (userId) {
      const set = this.userIndex.get(userId);
      set?.delete(connectionId);
      if (set && set.size === 0) this.userIndex.delete(userId);
    }
    await bound.registration.close(reason);
    return true;
  }

  public getConnections(): readonly RealtimeConnectionSnapshot[] {
    return [...this.connections.values()].map((bound) => ({
      id: bound.registration.id,
      userId: bound.registration.userId,
      tenantId: bound.registration.tenantId,
      rooms: [...bound.rooms],
      connectedAt: bound.connectedAt,
      lastHeartbeatAt: bound.lastHeartbeatAt,
      metadata: bound.registration.metadata ?? {},
    }));
  }

  public isConnected(connectionId: string): boolean {
    return this.connections.has(connectionId);
  }

  public connectionCount(): number {
    return this.connections.size;
  }

  public roomCount(): number {
    return this.rooms.size;
  }

  public isStarted(): boolean {
    return this.started;
  }

  public getSerializer(): RealtimeSerializer {
    return this.serializer;
  }

  private async sendToConnection(
    connectionId: string,
    event: RealtimeEvent,
  ): Promise<void> {
    const bound = this.connections.get(connectionId);
    if (!bound) return;
    if (
      event.tenantId &&
      bound.registration.tenantId &&
      event.tenantId !== bound.registration.tenantId
    ) {
      return;
    }
    await bound.registration.send(event.type, event);
  }

  private normalizeRoom(room: string): string {
    return room.trim();
  }
}
