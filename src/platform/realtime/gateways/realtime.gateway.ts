import { generateId } from '../../../core/identity/generate-id';
import type {
  RealtimeAuthContext,
  RealtimeAuthIdentity,
  RealtimeAuthProvider,
} from '../contracts/realtime-authentication.interface';
import type { RealtimeProvider } from '../contracts/realtime-provider.interface';
import type { RealtimePresence } from '../contracts/realtime-presence.interface';
import type { RealtimeConfig } from '../configuration/realtime.config';
import type { RealtimeMetrics } from '../observability/realtime-metrics';
import { InMemoryTransportAdapter } from '../adapters/in-memory-transport.adapter';

export interface GatewaySocketAdapter {
  readonly id?: string;
  send(eventType: string, payload: unknown): Promise<void>;
  close(reason?: string): Promise<void>;
}

export interface GatewayConnectResult {
  readonly accepted: boolean;
  readonly connectionId?: string;
  readonly identity?: RealtimeAuthIdentity;
  readonly reason?: string;
}

/**
 * Transport-agnostic gateway handler.
 * Nest `@WebSocketGateway`, Socket.IO, or SSE controllers should delegate
 * here — this class must never contain business logic.
 */
export class RealtimeGatewayHandler {
  public constructor(
    private readonly provider: RealtimeProvider,
    private readonly auth: RealtimeAuthProvider,
    private readonly config: RealtimeConfig,
    private readonly presence?: RealtimePresence,
    private readonly metrics?: RealtimeMetrics,
  ) {}

  public async handleConnect(
    socket: GatewaySocketAdapter,
    context: RealtimeAuthContext = {},
  ): Promise<GatewayConnectResult> {
    const identity = await this.auth.authenticate(context);
    if (!identity) {
      this.metrics?.recordAuthFailure();
      await socket.close('unauthorized');
      return { accepted: false, reason: 'unauthorized' };
    }
    if (!this.provider.registerConnection) {
      return {
        accepted: false,
        reason: 'provider-does-not-accept-connections',
      };
    }
    const connectionId = socket.id?.trim() || generateId('rtc');
    const registered = await this.provider.registerConnection({
      id: connectionId,
      userId: identity.userId,
      tenantId: identity.tenantId,
      metadata: {
        ...(identity.metadata ? identity.metadata : {}),
        roles: identity.roles ? identity.roles : [],
        anonymous: identity.anonymous === true,
      },
      send: (eventType, payload) => socket.send(eventType, payload),
      close: (reason) => socket.close(reason),
    });
    if (!registered) {
      await socket.close('rejected');
      return { accepted: false, reason: 'rejected' };
    }
    if (this.config.presenceEnabled && this.presence) {
      this.presence.markOnline(
        identity.userId,
        connectionId,
        identity.tenantId,
      );
    }
    this.metrics?.recordConnect();
    return { accepted: true, connectionId, identity };
  }

  public async handleJoin(
    connectionId: string,
    room: string,
  ): Promise<boolean> {
    return this.provider.joinRoom(connectionId, room);
  }

  public async handleLeave(
    connectionId: string,
    room: string,
  ): Promise<boolean> {
    return this.provider.leaveRoom(connectionId, room);
  }

  public handleHeartbeat(connectionId: string): boolean {
    if (!(this.provider instanceof InMemoryTransportAdapter)) {
      return this.provider.isConnected(connectionId);
    }
    const ok = this.provider.heartbeat(connectionId);
    if (!ok) return false;
    const connection = this.provider
      .getConnections()
      .find((item) => item.id === connectionId);
    if (connection && connection.userId && this.presence) {
      this.presence.heartbeat(connection.userId, connectionId);
    }
    this.metrics?.recordHeartbeat();
    return true;
  }

  public async handleDisconnect(
    connectionId: string,
    reason?: string,
  ): Promise<boolean> {
    const bound = this.provider
      .getConnections()
      .find((connection) => connection.id === connectionId);
    const removed = await this.provider.disconnectConnection(
      connectionId,
      reason,
    );
    if (removed && bound?.userId && this.presence) {
      this.presence.markOffline(bound.userId, connectionId);
    }
    if (removed) {
      this.metrics?.recordDisconnect();
    }
    return removed;
  }

  public async handlePublish(
    connectionId: string,
    room: string | undefined,
    eventType: string,
    payload: unknown,
  ): Promise<boolean> {
    if (!this.provider.isConnected(connectionId)) return false;
    const connection = this.provider
      .getConnections()
      .find((item) => item.id === connectionId);
    const { createRealtimeEvent } =
      await import('../events/create-realtime-event');
    const event = createRealtimeEvent({
      type: eventType,
      payload,
      tenantId: connection?.tenantId,
      correlationId:
        typeof connection?.metadata.correlationId === 'string'
          ? connection.metadata.correlationId
          : undefined,
    });
    if (room?.trim()) {
      await this.provider.publishToRoom(room.trim(), event);
    } else {
      await this.provider.publish(event);
    }
    this.metrics?.recordPublish(room ? 'room' : 'all');
    return true;
  }
}
