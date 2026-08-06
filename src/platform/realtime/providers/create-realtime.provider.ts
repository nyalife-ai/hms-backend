import type { RealtimeConfig } from '../configuration/realtime.config';
import type { RealtimeProvider } from '../contracts/realtime-provider.interface';
import type { RealtimeSerializer } from '../contracts/realtime-serializer.interface';
import { JsonRealtimeSerializer } from '../events/json-realtime.serializer';
import { AblyRealtimeProvider } from './ably.provider';
import { FirebaseRealtimeProvider } from './firebase.provider';
import { NestWebSocketProvider } from './nest-websocket.provider';
import { NoopRealtimeProvider } from './noop.provider';
import { PusherRealtimeProvider } from './pusher.provider';
import { SocketIOProvider } from './socketio.provider';
import { SSEProvider } from './sse.provider';

export class UnknownRealtimeProviderError extends Error {
  public constructor(kind: string) {
    super(`Unknown realtime provider "${kind}"`);
    this.name = 'UnknownRealtimeProviderError';
  }
}

export function createRealtimeProvider(
  config: Pick<
    RealtimeConfig,
    | 'enabled'
    | 'provider'
    | 'maxConnections'
    | 'maxRooms'
    | 'maxConnectionsPerRoom'
  >,
  serializer: RealtimeSerializer = new JsonRealtimeSerializer(),
): RealtimeProvider {
  if (!config.enabled) {
    return new NoopRealtimeProvider();
  }
  const limits = {
    maxConnections: config.maxConnections,
    maxRooms: config.maxRooms,
    maxConnectionsPerRoom: config.maxConnectionsPerRoom,
  };
  switch (config.provider) {
    case 'noop':
      return new NoopRealtimeProvider();
    case 'nest-ws':
      return new NestWebSocketProvider(limits, serializer);
    case 'socketio':
      return new SocketIOProvider(limits, serializer);
    case 'sse':
      return new SSEProvider(limits, serializer);
    case 'firebase':
      return new FirebaseRealtimeProvider();
    case 'pusher':
      return new PusherRealtimeProvider();
    case 'ably':
      return new AblyRealtimeProvider();
    default:
      throw new UnknownRealtimeProviderError(String(config.provider));
  }
}
