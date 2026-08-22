/**
 * Lightweight domain-event envelope for notification / async consumers.
 * Uses core createDomainEventId — payloads stay ID-centric (no PII dump).
 */

import { createDomainEventId } from '../../../core/domain';

export interface DomainEventEnvelope<
  T extends object = Record<string, unknown>,
> {
  readonly id: string;
  readonly type: string;
  readonly occurredAt: string;
  readonly actorId?: string;
  readonly payload: T;
}

export function createDomainEventEnvelope<T extends object>(input: {
  type: string;
  payload: T;
  actorId?: string;
  id?: string;
  occurredAt?: Date;
}): DomainEventEnvelope<T> {
  return {
    id: input.id?.trim() || createDomainEventId(),
    type: input.type,
    occurredAt: (input.occurredAt ?? new Date()).toISOString(),
    actorId: input.actorId,
    payload: input.payload,
  };
}
