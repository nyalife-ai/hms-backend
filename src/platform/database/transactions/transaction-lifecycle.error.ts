/**
 * Thrown when an adapter cannot safely expose split begin/commit/rollback
 * (for example Prisma, which only supports callback `$transaction`).
 */
export class TransactionLifecycleNotSupportedError extends Error {
  public constructor(
    message = 'Explicit begin/commit/rollback is not supported; use execute()',
  ) {
    super(message);
    this.name = 'TransactionLifecycleNotSupportedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
