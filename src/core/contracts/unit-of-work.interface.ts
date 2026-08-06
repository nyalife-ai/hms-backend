/**
 * Unit of Work — transactional boundary independent of ORM.
 *
 * Prefer {@link execute} for ACID boundaries. Explicit {@link begin} returns a
 * handle that must be committed or rolled back; adapters that cannot support a
 * split lifecycle (e.g. Prisma) reject begin/commit/rollback.
 */
export interface UnitOfWork {
  /**
   * Executes `work` inside a single transactional boundary.
   * Commits on success; rolls back on thrown errors.
   * The `uow` passed to `work` is bound to that transaction (safe for nesting).
   */
  execute<T>(work: (uow: UnitOfWork) => Promise<T>): Promise<T>;

  /**
   * Begins an explicit transaction and returns a handle bound to it.
   * Prefer {@link execute}. Callers must {@link commit} or {@link rollback}
   * the returned handle (not a shared manager singleton).
   */
  begin(): Promise<UnitOfWork>;

  commit(): Promise<void>;

  rollback(): Promise<void>;
}
