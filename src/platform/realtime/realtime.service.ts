import type { RealtimeProvider } from './contracts/realtime-provider.interface';
import type { RealtimePresence } from './contracts/realtime-presence.interface';
import type {
  CreateRealtimeEventInput,
  RealtimeEvent,
} from './events/realtime-event';
import { createRealtimeEvent } from './events/create-realtime-event';
import type { RealtimeConfig } from './configuration/realtime.config';
import type { RealtimeMetrics } from './observability/realtime-metrics';
import { InMemoryTransportAdapter } from './adapters/in-memory-transport.adapter';

/**
 * Facade consumed by future business modules.
 * Hides transport details behind a stable API.
 */
export class RealtimeService {
  public constructor(
    private readonly provider: RealtimeProvider,
    private readonly config: RealtimeConfig,
    private readonly presence?: RealtimePresence,
    private readonly metrics?: RealtimeMetrics,
  ) {}

  public get isEnabled(): boolean {
    return this.config.enabled && this.provider.name !== 'noop';
  }

  public getProviderName(): string {
    return String(this.provider.name);
  }

  public async start(): Promise<void> {
    await this.provider.connect?.();
  }

  public async stop(): Promise<void> {
    await this.provider.disconnect?.();
  }

  public async publish(
    input: CreateRealtimeEventInput | RealtimeEvent,
  ): Promise<RealtimeEvent> {
    const event = this.ensureEvent(input);
    await this.provider.publish(event);
    this.metrics?.recordPublish('all');
    return event;
  }

  public async publishToUser(
    userId: string,
    input: CreateRealtimeEventInput | RealtimeEvent,
  ): Promise<RealtimeEvent> {
    const normalized = userId.trim();
    if (!normalized) {
      throw new RangeError('userId must be a non-empty string');
    }
    const event = this.ensureEvent(input);
    await this.provider.publishToUser(normalized, event);
    this.metrics?.recordPublish('user');
    return event;
  }

  public async publishToRoom(
    room: string,
    input: CreateRealtimeEventInput | RealtimeEvent,
  ): Promise<RealtimeEvent> {
    const normalized = room.trim();
    if (!normalized) {
      throw new RangeError('room must be a non-empty string');
    }
    const event = this.ensureEvent(input);
    await this.provider.publishToRoom(normalized, event);
    this.metrics?.recordPublish('room');
    return event;
  }

  public async broadcast(
    input: CreateRealtimeEventInput | RealtimeEvent,
  ): Promise<RealtimeEvent> {
    const event = this.ensureEvent(input);
    await this.provider.broadcast(event);
    this.metrics?.recordPublish('broadcast');
    return event;
  }

  public joinRoom(connectionId: string, room: string): Promise<boolean> {
    return this.provider.joinRoom(connectionId, room);
  }

  public leaveRoom(connectionId: string, room: string): Promise<boolean> {
    return this.provider.leaveRoom(connectionId, room);
  }

  public async disconnect(
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

  public getConnections() {
    return this.provider.getConnections();
  }

  public isConnected(connectionId: string): boolean {
    return this.provider.isConnected(connectionId);
  }

  public connectionCount(): number {
    return this.provider.connectionCount();
  }

  public roomCount(): number {
    return this.provider.roomCount();
  }

  public getPresence(): RealtimePresence | undefined {
    return this.config.presenceEnabled ? this.presence : undefined;
  }

  public heartbeat(connectionId: string): boolean {
    if (this.provider instanceof InMemoryTransportAdapter) {
      const ok = this.provider.heartbeat(connectionId);
      if (ok) {
        const connection = this.provider
          .getConnections()
          .find((item) => item.id === connectionId);
        if (connection?.userId && this.presence) {
          this.presence.heartbeat(connection.userId, connectionId);
        }
        this.metrics?.recordHeartbeat();
      }
      return ok;
    }
    return this.provider.isConnected(connectionId);
  }

  private ensureEvent(
    input: CreateRealtimeEventInput | RealtimeEvent,
  ): RealtimeEvent {
    if (this.isRealtimeEvent(input)) {
      return input;
    }
    return createRealtimeEvent(input);
  }

  private isRealtimeEvent(
    input: CreateRealtimeEventInput | RealtimeEvent,
  ): input is RealtimeEvent {
    return (
      typeof input === 'object' &&
      input !== null &&
      typeof (input as RealtimeEvent).eventId === 'string' &&
      typeof (input as RealtimeEvent).type === 'string' &&
      typeof (input as RealtimeEvent).timestamp === 'string' &&
      'payload' in input
    );
  }
}
