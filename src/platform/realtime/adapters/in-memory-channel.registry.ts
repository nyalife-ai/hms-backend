import type { RealtimeEvent } from '../events/realtime-event';
import type { RealtimeChannel } from '../contracts/realtime-channel.interface';

type Handler = (event: RealtimeEvent) => void | Promise<void>;

/**
 * In-process named channel registry for fan-out independent of rooms.
 */
export class InMemoryChannelRegistry {
  private readonly channels = new Map<string, Set<Handler>>();

  public getChannel(name: string): RealtimeChannel {
    const normalized = name.trim();
    if (!normalized) {
      throw new RangeError('Channel name must be a non-empty string');
    }
    if (!this.channels.has(normalized)) {
      this.channels.set(normalized, new Set());
    }
    return {
      name: normalized,
      publish: async (event) => {
        const handlers = [...(this.channels.get(normalized) ?? [])];
        for (const handler of handlers) {
          await handler(event);
        }
      },
      subscribe: (handler) => {
        const set = this.channels.get(normalized)!;
        set.add(handler);
        return () => {
          set.delete(handler);
          if (set.size === 0) this.channels.delete(normalized);
        };
      },
    };
  }

  public channelCount(): number {
    return this.channels.size;
  }
}
