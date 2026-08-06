import {
  ConnectionAuthHook,
  ConnectionIdentity,
  ConnectionManagerLimits,
  RoomAuthorizationHook,
  WebSocketConnection,
  WebSocketPubSub,
} from './websocket.types';

interface BoundConnection {
  readonly connection: WebSocketConnection;
  readonly identity: Readonly<ConnectionIdentity>;
}

export class ConnectionManager {
  private readonly connections = new Map<string, BoundConnection>();
  private readonly rooms = new Map<string, Set<string>>();
  private readonly maxConnections: number;
  private readonly maxRooms: number;
  private readonly maxConnectionsPerRoom: number;

  public constructor(
    private readonly authenticate: ConnectionAuthHook = () =>
      Promise.resolve(undefined),
    private readonly authorizeRoom: RoomAuthorizationHook = () =>
      Promise.resolve(false),
    private readonly pubSub?: WebSocketPubSub,
    limits: Readonly<ConnectionManagerLimits> = {},
  ) {
    this.maxConnections = this.positiveLimit(
      limits.maxConnections,
      10_000,
      'maxConnections',
    );
    this.maxRooms = this.positiveLimit(limits.maxRooms, 10_000, 'maxRooms');
    this.maxConnectionsPerRoom = this.positiveLimit(
      limits.maxConnectionsPerRoom,
      1_000,
      'maxConnectionsPerRoom',
    );
  }

  public async connect(connection: WebSocketConnection): Promise<boolean> {
    if (
      !connection.id ||
      this.connections.has(connection.id) ||
      this.connections.size >= this.maxConnections
    ) {
      return false;
    }
    const identity = await this.authenticate(connection);
    if (!identity?.principalId.trim() || !identity.tenantId.trim()) {
      return false;
    }
    this.connections.set(connection.id, { connection, identity });
    return true;
  }

  public async join(connectionId: string, room: string): Promise<boolean> {
    const bound = this.connections.get(connectionId);
    const normalizedRoom = room.trim();
    if (
      !bound ||
      !normalizedRoom ||
      !(await this.authorizeRoom(bound.identity, normalizedRoom, 'join'))
    ) {
      return false;
    }
    const roomKey = this.roomKey(bound.identity.tenantId, normalizedRoom);
    const existing = this.rooms.get(roomKey);
    if (!existing && this.rooms.size >= this.maxRooms) {
      return false;
    }
    const members = existing ?? new Set<string>();
    if (
      !members.has(connectionId) &&
      members.size >= this.maxConnectionsPerRoom
    ) {
      return false;
    }
    members.add(connectionId);
    this.rooms.set(roomKey, members);
    return true;
  }

  public leave(connectionId: string, room: string): boolean {
    const bound = this.connections.get(connectionId);
    if (!bound) return false;
    const roomKey = this.roomKey(bound.identity.tenantId, room.trim());
    const members = this.rooms.get(roomKey);
    if (!members) return false;
    const removed = members.delete(connectionId);
    if (members.size === 0) this.rooms.delete(roomKey);
    return removed;
  }

  public async disconnect(connectionId: string): Promise<boolean> {
    const connection = this.connections.get(connectionId);
    if (!connection) return false;
    this.connections.delete(connectionId);
    for (const [room, members] of this.rooms) {
      members.delete(connectionId);
      if (members.size === 0) this.rooms.delete(room);
    }
    await connection.connection.close();
    return true;
  }

  public async broadcastRoom(
    connectionId: string,
    room: string,
    event: string,
    payload: unknown,
  ): Promise<boolean> {
    const sender = this.connections.get(connectionId);
    const normalizedRoom = room.trim();
    if (
      !sender ||
      !normalizedRoom ||
      !(await this.authorizeRoom(sender.identity, normalizedRoom, 'broadcast'))
    ) {
      return false;
    }
    const roomKey = this.roomKey(sender.identity.tenantId, normalizedRoom);
    await Promise.all(
      [...(this.rooms.get(roomKey) ?? [])]
        .map((id) => this.connections.get(id))
        .filter(
          (bound): bound is BoundConnection =>
            bound?.identity.tenantId === sender.identity.tenantId,
        )
        .map((bound) => bound.connection.send(event, payload)),
    );
    await this.pubSub?.publish(`tenant:${roomKey}`, event, payload);
    return true;
  }

  public async broadcastTenant(
    connectionId: string,
    event: string,
    payload: unknown,
  ): Promise<boolean> {
    const sender = this.connections.get(connectionId);
    if (!sender) return false;
    await Promise.all(
      [...this.connections.values()]
        .filter((bound) => bound.identity.tenantId === sender.identity.tenantId)
        .map((bound) => bound.connection.send(event, payload)),
    );
    await this.pubSub?.publish(
      `tenant:${sender.identity.tenantId}`,
      event,
      payload,
    );
    return true;
  }

  public count(): number {
    return this.connections.size;
  }

  public roomCount(): number {
    return this.rooms.size;
  }

  private roomKey(tenantId: string, room: string): string {
    return `${tenantId}:${room}`;
  }

  private positiveLimit(
    value: number | undefined,
    fallback: number,
    name: string,
  ): number {
    if (value === undefined) return fallback;
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive safe integer`);
    }
    return value;
  }
}
