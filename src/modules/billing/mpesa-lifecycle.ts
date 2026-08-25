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
 *
 * Internal stage codes stay for logs/workers; UI must use publicStageLabel /
 * statusUserMessage / mapMpesaFailureReason (user-facing, no eng jargon).
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

/** User-facing timeline row returned by status APIs (never expose eng stage codes). */
export type PublicTimelineEvent = {
  label: string;
  at: string;
  message?: string;
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

/** Short label for billing staff / patient-facing UI. */
export function publicStageLabel(stage: string | undefined | null): string {
  switch (stage) {
    case 'INITIATED':
    case 'QUEUED':
    case 'JOB_CREATED':
      return 'Preparing payment';
    case 'JOB_PICKED_UP':
    case 'PROCESSING':
    case 'DARAJA_AUTH':
      return 'Connecting to M-Pesa';
    case 'DARAJA_REQUEST_STARTED':
    case 'DARAJA_RESPONSE_RECEIVED':
      return 'Sending phone prompt';
    case 'STK_SENT':
    case 'WAITING_CALLBACK':
      return 'Waiting for PIN';
    case 'CALLBACK_RECEIVED':
    case 'FINALIZING':
      return 'Confirming payment';
    case 'SUCCESS':
      return 'Payment successful';
    case 'CANCELLED':
      return 'Payment cancelled';
    case 'TIMEOUT':
      return 'Payment timed out';
    case 'FAILED':
    case 'JOB_FAILED':
      return 'Payment failed';
    case 'JOB_RETRYING':
      return 'Retrying payment';
    default:
      return 'Updating payment';
  }
}

export function toPublicTimeline(
  timeline: unknown,
): PublicTimelineEvent[] {
  if (!Array.isArray(timeline)) return [];
  const out: PublicTimelineEvent[] = [];
  for (const raw of timeline) {
    const ev = raw as {
      stage?: string;
      at?: string;
      message?: string;
    };
    if (!ev?.at) continue;
    const message = sanitizeUserFacingMessage(ev.message);
    out.push({
      label: publicStageLabel(ev.stage),
      at: ev.at,
      ...(message ? { message } : {}),
    });
  }
  return out;
}

/** Strip eng / provider jargon from any message shown in the UI. */
export function sanitizeUserFacingMessage(
  message?: string | null,
): string | undefined {
  if (!message?.trim()) return undefined;
  const m = message.trim();
  const lower = m.toLowerCase();
  if (
    lower.includes('job_') ||
    lower.includes('daraja') ||
    lower.includes('bull') ||
    lower.includes('redis') ||
    lower.includes('worker') ||
    lower.includes('enqueue') ||
    lower.includes('oauth') ||
    lower.includes('mpesa_*') ||
    lower.includes('checkoutrequest') ||
    lower.includes('safaricom callback')
  ) {
    return undefined;
  }
  return m.slice(0, 240);
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
    return 'The phone number is not a valid M-Pesa number. Check and try again.';
  }
  if (
    lower.includes('oauth') ||
    lower.includes('unauthorized') ||
    code === '401'
  ) {
    return 'M-Pesa could not be reached right now. Please try again in a moment.';
  }
  if (
    lower.includes('redis') ||
    lower.includes('queue') ||
    lower.includes('econnrefused')
  ) {
    return 'Payment could not be started right now. Please try again shortly.';
  }
  if (lower.includes('timeout') || lower.includes('etimedout')) {
    return 'The payment request timed out. Please try again.';
  }
  if (code === '1032' || lower.includes('cancelled by user')) {
    return 'The patient cancelled the M-Pesa prompt on their phone.';
  }
  if (
    code === '1037' ||
    (lower.includes('timeout') && lower.includes('ds'))
  ) {
    return 'No PIN was entered in time. Ask the patient to try again.';
  }
  if (
    code === '1' ||
    lower.includes('insufficient') ||
    lower.includes('balance')
  ) {
    return 'Payment failed because of insufficient M-Pesa balance.';
  }
  if (code === 'AMOUNT_MISMATCH' || lower.includes('amount mismatch')) {
    return 'The amount confirmed by M-Pesa did not match this bill. Payment was not recorded.';
  }
  if (code === 'ALREADY_PAID' || lower.includes('already paid')) {
    return 'This visit is already paid.';
  }
  if (
    code === 'VISIT_NOT_READY' ||
    lower.includes('ready for billing')
  ) {
    return 'This visit is not ready for payment yet.';
  }
  // Prefer known-safe short desc; otherwise generic (never leak provider internals)
  if (
    desc &&
    !lower.includes('daraja') &&
    !lower.includes('stk push') &&
    !lower.includes('oauth') &&
    !lower.includes('redis') &&
    !lower.includes('mpesa_*')
  ) {
    // Strip common "M-Pesa STK Push failed:" prefixes from older stored reasons
    const cleaned = desc
      .replace(/^M-Pesa STK Push failed:\s*/i, '')
      .replace(/^M-Pesa payment failed:\s*/i, '')
      .slice(0, 200);
    if (cleaned) return cleaned;
  }
  if (code && !['0', 'FINALIZING'].includes(code)) {
    return 'M-Pesa could not complete this payment. Please try again or use another method.';
  }
  return 'M-Pesa could not complete this payment. Please try again.';
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
      return 'Preparing your M-Pesa payment request…';
    case 'PROCESSING':
      return stage === 'DARAJA_REQUEST_STARTED' ||
        stage === 'DARAJA_RESPONSE_RECEIVED'
        ? 'Sending the payment prompt to the patient’s phone…'
        : 'Connecting to M-Pesa…';
    case 'PENDING':
      return 'Prompt sent. Ask the patient to enter their M-Pesa PIN on their phone.';
    case 'FINALIZING':
      return 'Payment received. Confirming and preparing the receipt…';
    case 'SUCCESS':
      return 'Payment successful. Receipt is ready.';
    case 'CANCELLED':
      return mapMpesaFailureReason({
        resultCode: '1032',
        resultDesc: resultDesc,
      });
    case 'TIMEOUT':
      return 'No PIN was entered in time. You can send the payment request again.';
    case 'FAILED':
      return mapMpesaFailureReason({ resultDesc });
    default:
      return (
        sanitizeUserFacingMessage(resultDesc) ||
        'Updating payment status…'
      );
  }
}
