/**
 * Billing Bull queue names / job payloads — shared constants (no circular imports).
 */

export const BILLING_PAYMENTS_QUEUE = 'payments-queue';
export const BILLING_STK_JOB = 'payment.stk_push';

export type BillingStkJobData = {
  readonly visitId: string;
  readonly phone: string;
  readonly source: 'RECEPTION' | 'PHARMACY';
  readonly actorUserId: string;
  readonly dedupeKey: string;
};
