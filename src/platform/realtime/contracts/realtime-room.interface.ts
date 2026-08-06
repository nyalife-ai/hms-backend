import type { RealtimeEvent } from '../events/realtime-event';

export interface RealtimeRoom {
  readonly name: string;
  join(connectionId: string): Promise<boolean>;
  leave(connectionId: string): Promise<boolean>;
  broadcast(event: RealtimeEvent): Promise<number>;
  memberCount(): number;
  members(): readonly string[];
}
