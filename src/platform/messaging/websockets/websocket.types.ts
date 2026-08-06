export interface WebSocketConnection {
  readonly id: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  send(event: string, payload: unknown): Promise<void>;
  close(): Promise<void>;
}

export interface ConnectionIdentity {
  readonly principalId: string;
  readonly tenantId: string;
}

export type ConnectionAuthHook = (
  connection: WebSocketConnection,
) => Promise<Readonly<ConnectionIdentity> | undefined>;

export type RoomAction = 'join' | 'broadcast';

export type RoomAuthorizationHook = (
  identity: Readonly<ConnectionIdentity>,
  room: string,
  action: RoomAction,
) => Promise<boolean>;

export interface ConnectionManagerLimits {
  readonly maxConnections?: number;
  readonly maxRooms?: number;
  readonly maxConnectionsPerRoom?: number;
}

export interface WebSocketPubSub {
  publish(channel: string, event: string, payload: unknown): Promise<void>;
}
