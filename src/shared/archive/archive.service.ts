export interface Archivable {
  readonly archivedAt?: Date | null;
}

export const isArchived = (record: Archivable): boolean =>
  record.archivedAt != null;

export const markArchived = <T extends Archivable>(
  record: T,
  archivedAt: Date = new Date(),
): T & { archivedAt: Date } => ({ ...record, archivedAt });

export const markRestored = <T extends Archivable>(
  record: T,
): T & { archivedAt: null } => ({ ...record, archivedAt: null });

export const filterActive = <T extends Archivable>(
  records: readonly T[],
): T[] => records.filter((record) => !isArchived(record));

export const filterArchived = <T extends Archivable>(
  records: readonly T[],
): T[] => records.filter(isArchived);

export interface ArchiveRetentionPolicy {
  /** Records archived longer than this (in ms) are eligible for purging. */
  readonly maxAgeMs: number;
}

export const isEligibleForPurge = (
  record: Archivable,
  policy: ArchiveRetentionPolicy,
  now: Date = new Date(),
): boolean => {
  if (!isArchived(record)) {
    return false;
  }
  const archivedAt = record.archivedAt as Date;
  return now.getTime() - archivedAt.getTime() >= policy.maxAgeMs;
};

export interface ArchivableRecord extends Archivable {
  readonly id: string;
}

/**
 * In-memory keyed collection helper that tracks archived/active state.
 * Useful for tests and single-instance caches; production persistence
 * belongs in the module's own repository, using the pure helpers above.
 */
export class ArchiveService<T extends ArchivableRecord> {
  private readonly items = new Map<string, T>();

  public constructor(initial: readonly T[] = []) {
    for (const item of initial) {
      this.items.set(item.id, item);
    }
  }

  public add(item: T): void {
    this.items.set(item.id, item);
  }

  public get(id: string): T | undefined {
    return this.items.get(id);
  }

  public archive(id: string, archivedAt: Date = new Date()): T {
    const item = this.require(id);
    const archived = markArchived(item, archivedAt);
    this.items.set(id, archived);
    return archived;
  }

  public restore(id: string): T {
    const item = this.require(id);
    const restored = markRestored(item);
    this.items.set(id, restored);
    return restored;
  }

  public listActive(): T[] {
    return filterActive([...this.items.values()]);
  }

  public listArchived(): T[] {
    return filterArchived([...this.items.values()]);
  }

  public purgeEligible(
    policy: ArchiveRetentionPolicy,
    now: Date = new Date(),
  ): T[] {
    const purged: T[] = [];
    for (const [id, item] of this.items) {
      if (isEligibleForPurge(item, policy, now)) {
        purged.push(item);
        this.items.delete(id);
      }
    }
    return purged;
  }

  private require(id: string): T {
    const item = this.items.get(id);
    if (!item) {
      throw new Error(`ArchiveService: no record with id "${id}"`);
    }
    return item;
  }
}
