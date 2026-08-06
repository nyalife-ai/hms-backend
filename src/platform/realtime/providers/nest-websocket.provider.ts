import {
  InMemoryTransportAdapter,
  type InMemoryTransportLimits,
} from '../adapters/in-memory-transport.adapter';
import type { RealtimeSerializer } from '../contracts/realtime-serializer.interface';

/**
 * NestJS WebSocket-compatible provider.
 * Holds an in-process transport that a Nest gateway binds sockets into via
 * {@link RealtimeGatewayHandler}. No hard dependency on @nestjs/websockets.
 */
export class NestWebSocketProvider extends InMemoryTransportAdapter {
  public constructor(
    limits: InMemoryTransportLimits = {},
    serializer?: RealtimeSerializer,
  ) {
    super('nest-ws', limits, serializer);
  }
}
