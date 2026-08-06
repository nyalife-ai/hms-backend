import type { RealtimeConnectionSnapshot } from '../contracts/realtime-connection.interface';
import type {
  RealtimeConnectionRegistration,
  RealtimeProvider,
  RealtimeProviderKind,
} from '../contracts/realtime-provider.interface';
import { NoopRealtimeProvider } from './noop.provider';

/**
 * Shared stub for cloud providers that are intentionally not wired yet.
 * Connection-management methods noop; publish paths fail loudly.
 */
export abstract class UnconfiguredRealtimeProvider implements RealtimeProvider {
  public abstract readonly name: RealtimeProviderKind;
  private readonly noop = new NoopRealtimeProvider();

  protected abstract notConfigured(operation: string): Error;

  public async connect(): Promise<void> {
    await Promise.resolve();
    throw this.notConfigured('connect');
  }

  public async disconnect(): Promise<void> {
    await this.noop.disconnect();
  }

  public async publish(): Promise<void> {
    await Promise.resolve();
    throw this.notConfigured('publish');
  }

  public async publishToUser(): Promise<void> {
    await Promise.resolve();
    throw this.notConfigured('publishToUser');
  }

  public async publishToRoom(): Promise<void> {
    await Promise.resolve();
    throw this.notConfigured('publishToRoom');
  }

  public async broadcast(): Promise<void> {
    await Promise.resolve();
    throw this.notConfigured('broadcast');
  }

  public joinRoom(connectionId: string, room: string): Promise<boolean> {
    return this.noop.joinRoom(connectionId, room);
  }

  public leaveRoom(connectionId: string, room: string): Promise<boolean> {
    return this.noop.leaveRoom(connectionId, room);
  }

  public disconnectConnection(
    connectionId: string,
    reason?: string,
  ): Promise<boolean> {
    return this.noop.disconnectConnection(connectionId, reason);
  }

  public getConnections(): readonly RealtimeConnectionSnapshot[] {
    return this.noop.getConnections();
  }

  public isConnected(connectionId: string): boolean {
    return this.noop.isConnected(connectionId);
  }

  public connectionCount(): number {
    return this.noop.connectionCount();
  }

  public roomCount(): number {
    return this.noop.roomCount();
  }

  public registerConnection(
    connection: RealtimeConnectionRegistration,
  ): Promise<boolean> {
    return this.noop.registerConnection(connection);
  }
}
