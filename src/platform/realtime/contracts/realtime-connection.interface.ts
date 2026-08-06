/**
 * A single connected realtime client (socket, SSE stream, or provider session).
 */
export interface RealtimeConnection {
  readonly id: string;
  readonly userId?: string;
  readonly tenantId?: string;
  readonly rooms: ReadonlySet<string>;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly connectedAt: Date;
  readonly lastHeartbeatAt: Date;
  send(eventType: string, payload: unknown): Promise<void>;
  close(reason?: string): Promise<void>;
}

export interface RealtimeConnectionSnapshot {
  readonly id: string;
  readonly userId?: string;
  readonly tenantId?: string;
  readonly rooms: readonly string[];
  readonly connectedAt: Date;
  readonly lastHeartbeatAt: Date;
  readonly metadata: Readonly<Record<string, unknown>>;
}
