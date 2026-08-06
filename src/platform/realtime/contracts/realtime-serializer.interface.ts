import type { RealtimeEvent } from '../events/realtime-event';

export interface RealtimeSerializer {
  serialize(event: RealtimeEvent): string | Buffer;
  deserialize(raw: string | Buffer): RealtimeEvent;
}
