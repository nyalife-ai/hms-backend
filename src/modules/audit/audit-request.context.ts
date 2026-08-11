/**
 * Request-scoped audit context via AsyncLocalStorage.
 * HTTP middleware starts the store; JWT interceptor fills userId.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export type AuditRequestStore = {
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** When > 0, Prisma middleware skips writing audit rows (avoids recursion). */
  skipDepth: number;
};

export const auditRequestStorage = new AsyncLocalStorage<AuditRequestStore>();

export function getAuditRequestStore(): AuditRequestStore | undefined {
  return auditRequestStorage.getStore();
}

export function runWithAuditContext<T>(
  store: AuditRequestStore,
  fn: () => T,
): T {
  return auditRequestStorage.run(store, fn);
}
