/**
 * Billing Bull queue names / job payloads.
 * Namespaced so a shared Redis is not polluted by other apps' `payments-queue`.
 */

export const BILLING_PAYMENTS_QUEUE =
  process.env.BULL_PAYMENTS_QUEUE?.trim() || 'nyalife-payments';

export const BILLING_STK_JOB = 'payment.stk_push';

export type BillingStkJobData = {
  readonly visitId: string;
  readonly phone: string;
  readonly source: 'RECEPTION' | 'PHARMACY';
  readonly actorUserId: string;
  readonly dedupeKey: string;
};
