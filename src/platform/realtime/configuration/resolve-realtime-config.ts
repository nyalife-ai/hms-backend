import {
  DEFAULT_REALTIME_CONFIG,
  type RealtimeAuthKind,
  type RealtimeConfig,
  type RealtimeProviderName,
  type RealtimeTransportKind,
} from './realtime.config';

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new RangeError(`Invalid boolean env value: ${value}`);
}

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  return parsed;
}

function parseProvider(value: string | undefined): RealtimeProviderName {
  const normalized = (value ?? DEFAULT_REALTIME_CONFIG.provider)
    .trim()
    .toLowerCase();
  const allowed: RealtimeProviderName[] = [
    'noop',
    'nest-ws',
    'socketio',
    'sse',
    'firebase',
    'pusher',
    'ably',
  ];
  if (!allowed.includes(normalized as RealtimeProviderName)) {
    throw new RangeError(
      `REALTIME_PROVIDER must be one of: ${allowed.join(', ')}`,
    );
  }
  return normalized as RealtimeProviderName;
}

function parseTransport(value: string | undefined): RealtimeTransportKind {
  const normalized = (value ?? DEFAULT_REALTIME_CONFIG.transport)
    .trim()
    .toLowerCase();
  const allowed: RealtimeTransportKind[] = ['ws', 'socketio', 'sse', 'none'];
  if (!allowed.includes(normalized as RealtimeTransportKind)) {
    throw new RangeError(
      `REALTIME_TRANSPORT must be one of: ${allowed.join(', ')}`,
    );
  }
  return normalized as RealtimeTransportKind;
}

function parseAuth(value: string | undefined): RealtimeAuthKind {
  const normalized = (value ?? DEFAULT_REALTIME_CONFIG.auth)
    .trim()
    .toLowerCase();
  const allowed: RealtimeAuthKind[] = ['jwt', 'api-key', 'anonymous'];
  if (!allowed.includes(normalized as RealtimeAuthKind)) {
    throw new RangeError(`REALTIME_AUTH must be one of: ${allowed.join(', ')}`);
  }
  return normalized as RealtimeAuthKind;
}

/**
 * Resolves realtime configuration from process env (or an injected map).
 * When `REALTIME_ENABLED=false`, forces the noop provider regardless of
 * `REALTIME_PROVIDER` so the app always boots safely.
 */
export function resolveRealtimeConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): RealtimeConfig {
  const enabled = parseBoolean(
    env.REALTIME_ENABLED,
    DEFAULT_REALTIME_CONFIG.enabled,
  );
  const provider = enabled ? parseProvider(env.REALTIME_PROVIDER) : 'noop';
  const transport = enabled ? parseTransport(env.REALTIME_TRANSPORT) : 'none';
  const apiKeys = (env.REALTIME_API_KEYS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    enabled,
    provider,
    transport,
    port: parsePositiveInt(
      env.REALTIME_PORT,
      DEFAULT_REALTIME_CONFIG.port,
      'REALTIME_PORT',
    ),
    heartbeatMs: parsePositiveInt(
      env.REALTIME_HEARTBEAT,
      DEFAULT_REALTIME_CONFIG.heartbeatMs,
      'REALTIME_HEARTBEAT',
    ),
    auth: parseAuth(env.REALTIME_AUTH),
    jwtSecret: env.REALTIME_JWT_SECRET?.trim() || env.JWT_SECRET?.trim(),
    apiKeys,
    maxConnections: parsePositiveInt(
      env.REALTIME_MAX_CONNECTIONS,
      DEFAULT_REALTIME_CONFIG.maxConnections,
      'REALTIME_MAX_CONNECTIONS',
    ),
    maxRooms: parsePositiveInt(
      env.REALTIME_MAX_ROOMS,
      DEFAULT_REALTIME_CONFIG.maxRooms,
      'REALTIME_MAX_ROOMS',
    ),
    maxConnectionsPerRoom: parsePositiveInt(
      env.REALTIME_MAX_CONNECTIONS_PER_ROOM,
      DEFAULT_REALTIME_CONFIG.maxConnectionsPerRoom,
      'REALTIME_MAX_CONNECTIONS_PER_ROOM',
    ),
    presenceEnabled: parseBoolean(
      env.REALTIME_PRESENCE_ENABLED,
      DEFAULT_REALTIME_CONFIG.presenceEnabled,
    ),
    presenceIdleMs: parsePositiveInt(
      env.REALTIME_PRESENCE_IDLE_MS,
      DEFAULT_REALTIME_CONFIG.presenceIdleMs,
      'REALTIME_PRESENCE_IDLE_MS',
    ),
  };
}
