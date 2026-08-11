/**
 * Insurance claim status transitions + amount rules.
 */

import { BadRequestException } from '@nestjs/common';
import { assertNonNegative, moneyFrom } from './money';

export const CLAIM_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'PARTIALLY_PAID',
  'PAID',
  'DENIED',
] as const;

export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

const ALLOWED: Record<ClaimStatus, ClaimStatus[]> = {
  DRAFT: ['SUBMITTED', 'DENIED'],
  SUBMITTED: ['UNDER_REVIEW', 'APPROVED', 'DENIED'],
  UNDER_REVIEW: ['APPROVED', 'DENIED', 'PARTIALLY_PAID', 'PAID'],
  APPROVED: ['PARTIALLY_PAID', 'PAID', 'DENIED'],
  PARTIALLY_PAID: ['PARTIALLY_PAID', 'PAID'],
  PAID: [],
  DENIED: [],
};

export function assertClaimTransition(from: string, to: string): void {
  const f = from.toUpperCase() as ClaimStatus;
  const t = to.toUpperCase() as ClaimStatus;
  if (!CLAIM_STATUSES.includes(f) || !CLAIM_STATUSES.includes(t)) {
    throw new BadRequestException('Invalid claim status');
  }
  if (f === t && (f === 'PARTIALLY_PAID' || f === 'UNDER_REVIEW')) return;
  if (!ALLOWED[f].includes(t)) {
    throw new BadRequestException(
      `Cannot change claim status from ${f} to ${t}`,
    );
  }
}

export function assertClaimAmounts(input: {
  claimed: string | number;
  approved?: string | number | null;
  paid?: string | number | null;
}): void {
  const claimed = moneyFrom(input.claimed);
  assertNonNegative(claimed, 'Amount claimed');
  if (input.approved !== undefined && input.approved !== null) {
    const approved = moneyFrom(input.approved);
    assertNonNegative(approved, 'Amount approved');
    if (approved.compareTo(claimed) > 0) {
      throw new BadRequestException(
        'Approved amount cannot exceed the claimed amount',
      );
    }
  }
  if (input.paid !== undefined && input.paid !== null) {
    const paid = moneyFrom(input.paid);
    assertNonNegative(paid, 'Amount paid');
    const cap =
      input.approved !== undefined && input.approved !== null
        ? moneyFrom(input.approved)
        : claimed;
    if (paid.compareTo(cap) > 0) {
      throw new BadRequestException(
        'Paid amount cannot exceed the approved amount',
      );
    }
  }
}
