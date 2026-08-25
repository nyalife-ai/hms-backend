/**
 * Billing Bull queue names / job payloads.
 * Namespaced so a shared Redis is not polluted by other apps' `payments-queue`.
 *
 * STK journey: CheckoutService.initiateStk → add(payment.stk_push)
 *   → BillingStkProcessor → CheckoutService.executeQueuedStk → Daraja
 */

export const BILLING_PAYMENTS_QUEUE =
  process.env.BULL_PAYMENTS_QUEUE?.trim() || 'nyalife-payments';

export const BILLING_STK_JOB = 'payment.stk_push';

export type BillingStkJobData = {
  /** Correlation id = billing.mpesa_transactions.id */
  readonly checkoutId: string;
  readonly visitId: string;
  readonly phone: string;
  readonly source: 'RECEPTION' | 'PHARMACY';
  readonly actorUserId: string;
  readonly dedupeKey: string;
};
