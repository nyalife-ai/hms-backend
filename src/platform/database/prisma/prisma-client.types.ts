/**
 * Narrow Prisma client port used by the platform.
 *
 * Prefer {@link healthCheck} for probes. Use {@link queryRaw} only with a
 * fixed SQL string and bound `params` — never interpolate untrusted input
 * into the SQL text.
 */
export interface PrismaClientLike {
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  $transaction<T>(work: (client: unknown) => Promise<T>): Promise<T>;
  /** Dedicated connectivity probe when available. */
  healthCheck?(): Promise<unknown>;
  /**
   * Parameterized raw query. Implementations must bind `params` safely
   * (never concatenate user input into `sql`).
   */
  queryRaw?(sql: string, params?: readonly unknown[]): Promise<unknown>;
}
