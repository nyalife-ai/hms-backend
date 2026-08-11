/**
 * Document number generation with P2002 retry.
 */

import { ConflictException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma';

type Tx = {
  invoices: { count: () => Promise<number> };
  payments: { count: () => Promise<number> };
  journalEntries: { count: () => Promise<number> };
  insuranceClaims: { count: () => Promise<number> };
};

export async function nextDocumentNumber(
  tx: Tx,
  kind: 'INV' | 'PAY' | 'JE' | 'CLM',
  attempt = 0,
): Promise<string> {
  const year = new Date().getFullYear();
  let seq = 0;
  if (kind === 'INV') seq = await tx.invoices.count();
  else if (kind === 'PAY') seq = await tx.payments.count();
  else if (kind === 'JE') seq = await tx.journalEntries.count();
  else seq = await tx.insuranceClaims.count();
  const n = seq + 1 + attempt;
  return `${kind}-${year}-${String(n).padStart(4, '0')}`;
}

export function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}

export async function withNumberRetry<T>(
  fn: (attempt: number) => Promise<T>,
  maxAttempts = 5,
): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      last = err;
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw last instanceof Error
    ? last
    : new ConflictException('Could not allocate a unique document number');
}
