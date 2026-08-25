/**
 * M-Pesa STK payment lifecycle helpers.
 *
 * Journey (correlation id = mpesa_transactions.id):
 *   UI → POST /billing/checkout/stk
 *     → create row (DB status PENDING, stage QUEUED) + Bull job payment.stk_push
 *     → worker PROCESSING → Daraja STK
 *     → PENDING / stage WAITING_CALLBACK (STK accepted, waiting customer/callback)
 *     → SUCCESS | FAILED | CANCELLED | TIMEOUT
 *
 * QUEUED / PROCESSING / PENDING are NOT payment success.
 *
 * DB note: the original CHECK only allows PENDING|SUCCESS|FAILED|CANCELLED.
 * Logical lifecycle (QUEUED/PROCESSING/FINALIZING/TIMEOUT) lives in payload.stage
 * (+ result_code for FINALIZING/TIMEOUT) so STK works even before the lifecycle
 * migration is applied. Prefer applying 20260825070000_mpesa_lifecycle_statuses.
 */

export const MPESA_STATUSES = [
  'QUEUED',
  'PROCESSING',
  'PENDING',
  'FINALIZING',
  'SUCCESS',
  'FAILED',
  'CANCELLED',
  'TIMEOUT',
] as const;

export type MpesaStatus = (typeof MPESA_STATUSES)[number];

/**
 * Status values safe for billing.mpesa_transactions under the original CHECK
 * constraint (and the expanded lifecycle migration).
 */
export const DB_SAFE_MPESA_STATUSES = [
  'PENDING',
  'SUCCESS',
  'FAILED',
  'CANCELLED',
] as const;

/** Fine-grained stage for timeline / UI (stored in payload.stage + payload.timeline). */
export const MPESA_STAGES = [
  'INITIATED',
  'QUEUED',
  'JOB_CREATED',
  'JOB_PICKED_UP',
  'PROCESSING',
  'DARAJA_AUTH',
  'DARAJA_REQUEST_STARTED',
  'DARAJA_RESPONSE_RECEIVED',
  'STK_SENT',
  'WAITING_CALLBACK',
  'CALLBACK_RECEIVED',
  'FINALIZING',
  'SUCCESS',
  'FAILED',
  'CANCELLED',
  'TIMEOUT',
  'JOB_FAILED',
  'JOB_RETRYING',
] as const;

export type MpesaStage = (typeof MPESA_STAGES)[number];

export type MpesaTimelineEvent = {
  stage: MpesaStage;
  at: string;
  message?: string;
  detail?: Record<string, unknown>;
};

export const TERMINAL_MPESA_STATUSES: ReadonlySet<string> = new Set([
  'SUCCESS',
  'FAILED',
  'CANCELLED',
  'TIMEOUT',
]);

export const WAITING_CUSTOMER_STATUSES: ReadonlySet<string> = new Set([
  'PENDING',
]);

/** Default wait for customer PIN / callback before TIMEOUT (ms). */
export const MPESA_STK_TIMEOUT_MS = 90_000;

export function isTerminalMpesaStatus(status: string): boolean {
  return TERMINAL_MPESA_STATUSES.has(status);
}

/** Map logical lifecycle status → column value allowed by legacy CHECK. */
export function toDbMpesaStatus(logical: string): string {
  switch (logical) {
    case 'QUEUED':
    case 'PROCESSING':
    case 'FINALIZING':
    case 'PENDING':
      return 'PENDING';
    case 'TIMEOUT':
      return 'FAILED';
    case 'SUCCESS':
    case 'FAILED':
    case 'CANCELLED':
      return logical;
    default:
      return 'PENDING';
  }
}

/** Public/API status derived from DB row + payload.stage. */
export function resolvePublicMpesaStatus(tx: {
  status: string;
  result_code?: string | null;
  payload?: unknown;
}): string {
  if (tx.status === 'SUCCESS' || tx.status === 'CANCELLED') return tx.status;
  if (tx.status === 'FAILED') {
    return tx.result_code === 'TIMEOUT' ? 'TIMEOUT' : 'FAILED';
  }
  // PENDING (or unexpected)
  if (tx.result_code === 'FINALIZING') return 'FINALIZING';
  const stage = (tx.payload as { stage?: string } | null | undefined)?.stage;
  if (
    stage === 'QUEUED' ||
    stage === 'JOB_CREATED' ||
    stage === 'INITIATED'
  ) {
    return 'QUEUED';
  }
  if (
    stage === 'PROCESSING' ||
    stage === 'JOB_PICKED_UP' ||
    stage === 'DARAJA_REQUEST_STARTED' ||
    stage === 'DARAJA_AUTH' ||
    stage === 'DARAJA_RESPONSE_RECEIVED'
  ) {
    return 'PROCESSING';
  }
  if (stage === 'TIMEOUT') return 'TIMEOUT';
  if (stage === 'FAILED' || stage === 'JOB_FAILED') return 'FAILED';
  if (stage === 'CANCELLED') return 'CANCELLED';
  if (stage === 'SUCCESS') return 'SUCCESS';
  return 'PENDING';
}

export function isTerminalMpesaRow(tx: {
  status: string;
  result_code?: string | null;
  payload?: unknown;
}): boolean {
  return isTerminalMpesaStatus(resolvePublicMpesaStatus(tx));
}

export function maskMpesaPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return '***';
  return `${digits.slice(0, 4)}XXXX${digits.slice(-3)}`;
}

export function appendTimeline(
  payload: Record<string, unknown> | null | undefined,
  stage: MpesaStage,
  message?: string,
  detail?: Record<string, unknown>,
): Record<string, unknown> {
  const base = { ...(payload ?? {}) };
  const prev = Array.isArray(base.timeline)
    ? (base.timeline as MpesaTimelineEvent[])
    : [];
  const event: MpesaTimelineEvent = {
    stage,
    at: new Date().toISOString(),
    ...(message ? { message } : {}),
    ...(detail ? { detail } : {}),
  };
  return {
    ...base,
    stage,
    timeline: [...prev, event].slice(-40),
  };
}

export function placeholderCheckoutRequestId(paymentId: string): string {
  return `QUEUED-${paymentId.replace(/-/g, '').slice(0, 24)}`;
}

/** Human-readable failure for UI / notifications (never includes secrets). */
export function mapMpesaFailureReason(input: {
  resultCode?: string | null;
  resultDesc?: string | null;
  rawMessage?: string | null;
}): string {
  const code = (input.resultCode || '').trim();
  const desc = (input.resultDesc || input.rawMessage || '').trim();
  const lower = desc.toLowerCase();

  if (
    lower.includes('invalid m-pesa phone') ||
    lower.includes('valid kenyan mobile')
  ) {
    return 'M-Pesa STK Push failed: Invalid phone number.';
  }
  if (
    lower.includes('oauth') ||
    lower.includes('unauthorized') ||
    code === '401'
  ) {
    return 'M-Pesa STK Push failed: Daraja authentication failed. Check MPESA credentials.';
  }
  if (
    lower.includes('redis') ||
    lower.includes('queue') ||
    lower.includes('econnrefused')
  ) {
    return 'Payment request could not be sent because the payment queue (Redis) is unavailable.';
  }
  if (lower.includes('timeout') || lower.includes('etimedout')) {
    return 'Payment request timed out while contacting M-Pesa. Please try again.';
  }
  if (code === '1032' || lower.includes('cancelled by user')) {
    return 'The customer cancelled the M-Pesa prompt on their phone.';
  }
  if (code === '1037' || lower.includes('timeout') && lower.includes('ds')) {
    return 'The STK request timed out before the customer entered their PIN.';
  }
  if (
    code === '1' ||
    lower.includes('insufficient') ||
    lower.includes('balance')
  ) {
    return 'M-Pesa payment failed: insufficient funds.';
  }
  if (desc) {
    return `M-Pesa STK Push failed: ${desc.slice(0, 240)}`;
  }
  if (code) {
    return `M-Pesa STK Push failed (code ${code}).`;
  }
  return 'M-Pesa STK Push failed: Daraja rejected the request.';
}

/**
 * Decide whether Bull should retry after this error.
 * Permanent client/config errors must not spam Daraja.
 */
export function isRetryableStkError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  if (
    lower.includes('valid kenyan') ||
    lower.includes('invalid m-pesa phone') ||
    lower.includes('amount must be greater') ||
    lower.includes('already paid') ||
    lower.includes('must be ready for billing') ||
    lower.includes('insurance')
  ) {
    return false;
  }
  if (
    lower.includes('oauth failed') ||
    lower.includes('missing access_token') ||
    lower.includes('invalid consumer') ||
    /m-?pesa stk failed \(40[13]\)/i.test(lower) ||
    /m-?pesa stk failed \(400\)/i.test(lower) ||
    lower.includes('stk failed (401)') ||
    lower.includes('stk failed (403)') ||
    lower.includes('stk failed (400)')
  ) {
    return false;
  }
  // Daraja business rejection with ResponseCode != 0 often not worth blind retries
  if (
    lower.includes('responsecode') ||
    lower.includes('bad request') ||
    lower.includes('stk failed (400)')
  ) {
    return false;
  }
  return true;
}

export function statusUserMessage(
  status: string,
  stage?: string,
  resultDesc?: string | null,
): string {
  switch (status) {
    case 'QUEUED':
      return 'Payment request queued — waiting for the worker to send STK Push.';
    case 'PROCESSING':
      return stage === 'DARAJA_REQUEST_STARTED'
        ? 'Sending STK Push to M-Pesa…'
        : 'Processing payment request…';
    case 'PENDING':
      return 'STK Push sent — waiting for the customer to enter their M-Pesa PIN.';
    case 'FINALIZING':
      return 'Payment confirmed — finalizing receipt…';
    case 'SUCCESS':
      return 'Payment successful.';
    case 'CANCELLED':
      return mapMpesaFailureReason({
        resultCode: '1032',
        resultDesc: resultDesc,
      });
    case 'TIMEOUT':
      return 'The STK request was accepted by M-Pesa, but the customer did not complete payment in time.';
    case 'FAILED':
      return mapMpesaFailureReason({ resultDesc });
    default:
      return resultDesc || `Payment status: ${status}`;
  }
}
