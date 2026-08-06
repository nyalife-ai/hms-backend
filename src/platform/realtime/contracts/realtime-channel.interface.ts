import type { RealtimeEvent } from '../events/realtime-event';

/**
 * Named pub/sub channel (topic) independent of transport rooms.
 */
export interface RealtimeChannel {
  readonly name: string;
  publish(event: RealtimeEvent): Promise<void>;
  subscribe(
    handler: (event: RealtimeEvent) => void | Promise<void>,
  ): () => void;
}
