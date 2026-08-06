import { generateId } from '../../../core/identity/generate-id';
import type { CreateRealtimeEventInput, RealtimeEvent } from './realtime-event';

export function createRealtimeEvent<T = unknown>(
  input: CreateRealtimeEventInput<T>,
): RealtimeEvent<T> {
  const type = input.type.trim();
  if (!type) {
    throw new RangeError('Realtime event type must be a non-empty string');
  }
  const timestamp =
    input.timestamp instanceof Date
      ? input.timestamp.toISOString()
      : (input.timestamp ?? new Date().toISOString());
  return {
    eventId: input.eventId?.trim() || generateId('rte'),
    type,
    timestamp,
    correlationId: input.correlationId?.trim() || undefined,
    tenantId: input.tenantId?.trim() || undefined,
    payload: input.payload,
    metadata: input.metadata,
  };
}
