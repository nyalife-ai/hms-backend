import type {
  RealtimeConnectionRegistration,
  RealtimeProvider,
} from '../contracts/realtime-provider.interface';
import type { RealtimeConnectionSnapshot } from '../contracts/realtime-connection.interface';

/**
 * Default provider when realtime is disabled or unset.
 * All operations succeed as no-ops so callers never crash.
 */
export class NoopRealtimeProvider implements RealtimeProvider {
  public readonly name = 'noop' as const;

  public async connect(): Promise<void> {
    await Promise.resolve();
  }

  public async disconnect(): Promise<void> {
    await Promise.resolve();
  }

  public async publish(): Promise<void> {
    await Promise.resolve();
  }

  public async publishToUser(): Promise<void> {
    await Promise.resolve();
  }

  public async publishToRoom(): Promise<void> {
    await Promise.resolve();
  }

  public async broadcast(): Promise<void> {
    await Promise.resolve();
  }

  public async joinRoom(connectionId: string, room: string): Promise<boolean> {
    void connectionId;
    void room;
    await Promise.resolve();
    return false;
  }

  public async leaveRoom(connectionId: string, room: string): Promise<boolean> {
    void connectionId;
    void room;
    await Promise.resolve();
    return false;
  }

  public async disconnectConnection(
    connectionId: string,
    reason?: string,
  ): Promise<boolean> {
    void connectionId;
    void reason;
    await Promise.resolve();
    return false;
  }

  public getConnections(): readonly RealtimeConnectionSnapshot[] {
    return [];
  }

  public isConnected(connectionId: string): boolean {
    void connectionId;
    return false;
  }

  public connectionCount(): number {
    return 0;
  }

  public roomCount(): number {
    return 0;
  }

  public async registerConnection(
    connection: RealtimeConnectionRegistration,
  ): Promise<boolean> {
    void connection;
    await Promise.resolve();
    return false;
  }
}
