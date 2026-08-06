export type SoftDeletable = { deletedAt?: Date | string | number | null };

export const applySoftDeleteFilter = <T extends SoftDeletable>(
  records: readonly T[],
): T[] => records.filter((record) => !isDeleted(record));

export const markDeleted = <T extends SoftDeletable>(
  record: T,
  deletedAt: Date = new Date(),
): T & { deletedAt: Date } => ({ ...record, deletedAt });

/** Any non-null `deletedAt` value means the record is soft-deleted. */
export const isDeleted = (record: SoftDeletable): boolean =>
  record.deletedAt != null;
