export interface RealtimeEventMetadata {
  readonly [key: string]: unknown;
}

/**
 * Strongly typed realtime envelope consumed by all providers.
 */
export interface RealtimeEvent<T = unknown> {
  readonly eventId: string;
  readonly type: string;
  readonly timestamp: string;
  readonly correlationId?: string;
  readonly tenantId?: string;
  readonly payload: T;
  readonly metadata?: RealtimeEventMetadata;
}

export interface CreateRealtimeEventInput<T = unknown> {
  readonly type: string;
  readonly payload: T;
  readonly eventId?: string;
  readonly correlationId?: string;
  readonly tenantId?: string;
  readonly timestamp?: string | Date;
  readonly metadata?: RealtimeEventMetadata;
}
