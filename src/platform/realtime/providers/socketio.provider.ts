import {
  InMemoryTransportAdapter,
  type InMemoryTransportLimits,
} from '../adapters/in-memory-transport.adapter';
import type { RealtimeSerializer } from '../contracts/realtime-serializer.interface';

/**
 * Socket.IO-compatible provider.
 * Uses the same in-process transport; wire socket.io Server instances through
 * {@link RealtimeGatewayHandler}. Socket.IO itself remains an optional peer.
 */
export class SocketIOProvider extends InMemoryTransportAdapter {
  public constructor(
    limits: InMemoryTransportLimits = {},
    serializer?: RealtimeSerializer,
  ) {
    super('socketio', limits, serializer);
  }
}
