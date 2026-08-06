import type { RealtimeEvent } from './realtime-event';
import type { RealtimeSerializer } from '../contracts/realtime-serializer.interface';

export class JsonRealtimeSerializer implements RealtimeSerializer {
  public serialize(event: RealtimeEvent): string {
    return JSON.stringify(event);
  }

  public deserialize(raw: string | Buffer): RealtimeEvent {
    const text = typeof raw === 'string' ? raw : raw.toString('utf8');
    const parsed: unknown = JSON.parse(text);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as RealtimeEvent).eventId !== 'string' ||
      typeof (parsed as RealtimeEvent).type !== 'string' ||
      typeof (parsed as RealtimeEvent).timestamp !== 'string' ||
      !('payload' in parsed)
    ) {
      throw new TypeError('Invalid realtime event payload');
    }
    return parsed as RealtimeEvent;
  }
}
