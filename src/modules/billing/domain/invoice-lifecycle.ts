/**
 * Invoice status transitions.
 */

import { BadRequestException } from '@nestjs/common';
import type { Money } from '../../../shared/money/money';

export const INVOICE_STATUSES = [
  'DRAFT',
  'ISSUED',
  'PARTIALLY_PAID',
  'PAID',
  'VOIDED',
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

const ALLOWED: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ['ISSUED', 'VOIDED'],
  ISSUED: ['PARTIALLY_PAID', 'PAID', 'VOIDED'],
  PARTIALLY_PAID: ['PARTIALLY_PAID', 'PAID', 'VOIDED'],
  PAID: [],
  VOIDED: [],
};

export function assertInvoiceTransition(
  from: string,
  to: string,
): asserts to is InvoiceStatus {
  const f = from.toUpperCase() as InvoiceStatus;
  const t = to.toUpperCase() as InvoiceStatus;
  if (!INVOICE_STATUSES.includes(f) || !INVOICE_STATUSES.includes(t)) {
    throw new BadRequestException('Invalid invoice status');
  }
  if (f === t && (f === 'PARTIALLY_PAID' || f === 'PAID')) return;
  if (!ALLOWED[f].includes(t)) {
    throw new BadRequestException(
      `Cannot change invoice status from ${f} to ${t}`,
    );
  }
}

export function statusFromOutstanding(
  total: Money,
  outstanding: Money,
  current: string,
): InvoiceStatus {
  if (current === 'DRAFT' || current === 'VOIDED') {
    return current as InvoiceStatus;
  }
  if (outstanding.isZero()) return 'PAID';
  if (outstanding.compareTo(total) < 0) return 'PARTIALLY_PAID';
  return 'ISSUED';
}
