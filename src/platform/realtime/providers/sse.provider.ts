import {
  InMemoryTransportAdapter,
  type InMemoryTransportLimits,
} from '../adapters/in-memory-transport.adapter';
import type { RealtimeSerializer } from '../contracts/realtime-serializer.interface';
import type { RealtimeEvent } from '../events/realtime-event';

export type SseWrite = (chunk: string) => void | Promise<void>;

/**
 * Server-Sent Events provider.
 * Clients register via {@link attachSseClient}; the platform publishes using
 * the standard `event:` / `data:` SSE framing.
 */
export class SSEProvider extends InMemoryTransportAdapter {
  public constructor(
    limits: InMemoryTransportLimits = {},
    serializer?: RealtimeSerializer,
  ) {
    super('sse', limits, serializer);
  }

  public async attachSseClient(options: {
    readonly id: string;
    readonly userId?: string;
    readonly tenantId?: string;
    readonly metadata?: Readonly<Record<string, unknown>>;
    readonly write: SseWrite;
    readonly close?: () => void | Promise<void>;
  }): Promise<boolean> {
    const serializer = this.getSerializer();
    return this.registerConnection({
      id: options.id,
      userId: options.userId,
      tenantId: options.tenantId,
      metadata: options.metadata,
      send: async (eventType: string, payload: unknown) => {
        const event =
          typeof payload === 'object' &&
          payload !== null &&
          'eventId' in payload
            ? (payload as RealtimeEvent)
            : ({
                eventId: options.id,
                type: eventType,
                timestamp: new Date().toISOString(),
                payload,
              } satisfies RealtimeEvent);
        const data = serializer.serialize(event);
        const text = typeof data === 'string' ? data : data.toString('utf8');
        await options.write(`event: ${eventType}\ndata: ${text}\n\n`);
      },
      close: async () => {
        await options.close?.();
      },
    });
  }
}
