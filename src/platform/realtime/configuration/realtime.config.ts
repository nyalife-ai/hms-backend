export type RealtimeAuthKind = 'jwt' | 'api-key' | 'anonymous';

export type RealtimeTransportKind = 'ws' | 'socketio' | 'sse' | 'none';

export type RealtimeProviderName =
  'noop' | 'nest-ws' | 'socketio' | 'sse' | 'firebase' | 'pusher' | 'ably';

export interface RealtimeConfig {
  readonly enabled: boolean;
  readonly provider: RealtimeProviderName;
  readonly transport: RealtimeTransportKind;
  readonly port: number;
  readonly heartbeatMs: number;
  readonly auth: RealtimeAuthKind;
  readonly jwtSecret?: string;
  readonly apiKeys: readonly string[];
  readonly maxConnections: number;
  readonly maxRooms: number;
  readonly maxConnectionsPerRoom: number;
  readonly presenceEnabled: boolean;
  readonly presenceIdleMs: number;
}

export const DEFAULT_REALTIME_CONFIG: RealtimeConfig = {
  enabled: false,
  provider: 'noop',
  transport: 'none',
  port: 3001,
  heartbeatMs: 30_000,
  auth: 'jwt',
  apiKeys: [],
  maxConnections: 10_000,
  maxRooms: 10_000,
  maxConnectionsPerRoom: 1_000,
  presenceEnabled: true,
  presenceIdleMs: 90_000,
};
