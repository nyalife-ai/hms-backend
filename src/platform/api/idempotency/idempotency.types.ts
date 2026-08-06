export interface IdempotencyRequest {
  readonly method: string;
  readonly path: string;
  readonly body?: unknown;
  /** Tenant scope — included in the storage key and fingerprint. */
  readonly tenantId?: string;
  /** Principal scope — included in the storage key and fingerprint. */
  readonly principalId?: string;
}

export type IdempotencyRecordState = 'in_progress' | 'completed';

export interface IdempotencyRecord<T = unknown> {
  readonly fingerprint: string;
  readonly ownerToken: string;
  readonly state: IdempotencyRecordState;
  readonly expiresAt: number;
  readonly response?: T;
}

export interface IdempotencyExecution<T> {
  readonly response: T;
  readonly replayed: boolean;
}

export interface IdempotencyReservation {
  readonly kind: 'reserved';
  readonly ownerToken: string;
}

export interface IdempotencyExisting<T = unknown> {
  readonly kind: 'existing';
  readonly record: IdempotencyRecord<T>;
}

export type IdempotencyReserveResult<T = unknown> =
  IdempotencyReservation | IdempotencyExisting<T>;
