/**
 * Recovery helpers for soft-deleted records — mirrors the shape used by
 * `platform/database/soft-delete/soft-delete.helpers.ts` (`deletedAt`
 * marker) without importing platform code, so `shared` stays framework and
 * layer independent.
 */
export type SoftDeletable = {
  readonly deletedAt?: Date | string | number | null;
};

export const isSoftDeleted = (record: SoftDeletable): boolean =>
  record.deletedAt != null;

export const softDelete = <T extends SoftDeletable>(
  record: T,
  deletedAt: Date = new Date(),
): T & { deletedAt: Date } => ({ ...record, deletedAt });

/** Clears the `deletedAt` marker, making the record active again. */
export const restore = <T extends SoftDeletable>(
  record: T,
): T & { deletedAt: null } => ({ ...record, deletedAt: null });

export interface RecoveryWindowPolicy {
  /** Records deleted longer than this (in ms) can no longer be restored. */
  readonly maxRecoverableAgeMs: number;
}

const toTimestamp = (value: Date | string | number): number =>
  value instanceof Date ? value.getTime() : new Date(value).getTime();

/** True when a soft-deleted record is still within its recovery window. */
export const isRestorable = (
  record: SoftDeletable,
  policy: RecoveryWindowPolicy,
  now: Date = new Date(),
): boolean => {
  if (!isSoftDeleted(record)) {
    return false;
  }
  const deletedAt = toTimestamp(record.deletedAt as Date | string | number);
  return now.getTime() - deletedAt <= policy.maxRecoverableAgeMs;
};

/**
 * Restores `record` if it is still within the recovery window, otherwise
 * throws. Use {@link isRestorable} first to check without throwing.
 */
export function restoreWithinWindow<T extends SoftDeletable>(
  record: T,
  policy: RecoveryWindowPolicy,
  now: Date = new Date(),
): T & { deletedAt: null } {
  if (!isSoftDeleted(record)) {
    throw new Error('Cannot restore a record that is not soft-deleted');
  }
  if (!isRestorable(record, policy, now)) {
    throw new Error(
      'Record is outside its recovery window and can no longer be restored',
    );
  }
  return restore(record);
}

/** Partitions records into recoverable and permanently-deleted groups. */
export function partitionByRecoverability<T extends SoftDeletable>(
  records: readonly T[],
  policy: RecoveryWindowPolicy,
  now: Date = new Date(),
): { readonly recoverable: T[]; readonly expired: T[] } {
  const recoverable: T[] = [];
  const expired: T[] = [];
  for (const record of records) {
    if (!isSoftDeleted(record)) {
      continue;
    }
    (isRestorable(record, policy, now) ? recoverable : expired).push(record);
  }
  return { recoverable, expired };
}
