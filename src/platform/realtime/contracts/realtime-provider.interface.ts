import type { RealtimeConnectionSnapshot } from './realtime-connection.interface';
import type { RealtimeEvent } from '../events/realtime-event';

export type RealtimeProviderKind =
  'noop' | 'nest-ws' | 'socketio' | 'sse' | 'firebase' | 'pusher' | 'ably';

/**
 * Transport-agnostic realtime backend. Business code never depends on this
 * directly — inject {@link RealtimeService} instead.
 */
export interface RealtimeProvider {
  readonly name: string;
  connect?(): Promise<void>;
  disconnect?(): Promise<void>;
  publish(event: RealtimeEvent): Promise<void>;
  publishToUser(userId: string, event: RealtimeEvent): Promise<void>;
  publishToRoom(room: string, event: RealtimeEvent): Promise<void>;
  broadcast(event: RealtimeEvent): Promise<void>;
  joinRoom(connectionId: string, room: string): Promise<boolean>;
  leaveRoom(connectionId: string, room: string): Promise<boolean>;
  disconnectConnection(connectionId: string, reason?: string): Promise<boolean>;
  getConnections(): readonly RealtimeConnectionSnapshot[];
  isConnected(connectionId: string): boolean;
  connectionCount(): number;
  roomCount(): number;
  registerConnection?(
    connection: RealtimeConnectionRegistration,
  ): Promise<boolean>;
}

export interface RealtimeConnectionRegistration {
  readonly id: string;
  readonly userId?: string;
  readonly tenantId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  send(eventType: string, payload: unknown): Promise<void>;
  close(reason?: string): Promise<void>;
}
