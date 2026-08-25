/**
 * M-Pesa lifecycle helpers — phone mask, failure mapping, retry policy, timeline.
 */

import {
  appendTimeline,
  isRetryableStkError,
  isTerminalMpesaStatus,
  mapMpesaFailureReason,
  maskMpesaPhone,
  placeholderCheckoutRequestId,
  publicStageLabel,
  resolvePublicMpesaStatus,
  statusUserMessage,
  toDbMpesaStatus,
  toPublicTimeline,
} from '../mpesa-lifecycle';

describe('mpesa-lifecycle', () => {
  it('masks phone numbers', () => {
    expect(maskMpesaPhone('254712345678')).toBe('2547XXXX678');
  });

  it('builds placeholder checkout ids', () => {
    expect(
      placeholderCheckoutRequestId('a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
    ).toMatch(/^QUEUED-/);
  });

  it('appends timeline stages without dropping history', () => {
    const p1 = appendTimeline({}, 'INITIATED', 'start');
    const p2 = appendTimeline(p1, 'QUEUED', 'queued');
    expect(p2.stage).toBe('QUEUED');
    expect((p2.timeline as unknown[]).length).toBe(2);
  });

  it('maps failure reasons to human text', () => {
    expect(mapMpesaFailureReason({ rawMessage: 'valid Kenyan mobile' })).toMatch(
      /valid M-Pesa number/i,
    );
    expect(mapMpesaFailureReason({ rawMessage: 'ECONNREFUSED redis' })).toMatch(
      /try again/i,
    );
    expect(mapMpesaFailureReason({ resultCode: '1032' })).toMatch(/cancelled/i);
    expect(
      mapMpesaFailureReason({ resultDesc: 'The balance is insufficient' }),
    ).toMatch(/insufficient/i);
  });

  it('classifies retryable vs permanent STK errors', () => {
    expect(isRetryableStkError(new Error('fetch failed'))).toBe(true);
    expect(isRetryableStkError(new Error('valid Kenyan mobile'))).toBe(false);
    expect(isRetryableStkError(new Error('M-Pesa OAuth failed (401)'))).toBe(
      false,
    );
    expect(isRetryableStkError(new Error('M-Pesa STK failed (400)'))).toBe(
      false,
    );
  });

  it('exposes user-facing status messages (no worker/daraja jargon)', () => {
    expect(statusUserMessage('QUEUED')).toMatch(/Preparing/i);
    expect(statusUserMessage('QUEUED')).not.toMatch(/worker|job|STK Push/i);
    expect(statusUserMessage('PENDING')).toMatch(/PIN/i);
    expect(statusUserMessage('PENDING')).not.toMatch(/Daraja|callback/i);
  });

  it('maps stages to public labels', () => {
    expect(publicStageLabel('JOB_CREATED')).toBe('Preparing payment');
    expect(publicStageLabel('WAITING_CALLBACK')).toBe('Waiting for PIN');
    const tl = toPublicTimeline([
      {
        stage: 'JOB_PICKED_UP',
        at: '2026-01-01T00:00:00.000Z',
        message: 'Worker picked up',
      },
    ]);
    expect(tl[0].label).toBe('Connecting to M-Pesa');
    expect(tl[0].message).toBeUndefined();
  });

  it('knows terminal statuses', () => {
    expect(isTerminalMpesaStatus('SUCCESS')).toBe(true);
    expect(isTerminalMpesaStatus('PENDING')).toBe(false);
  });

  it('maps logical statuses onto legacy-safe DB values', () => {
    expect(toDbMpesaStatus('QUEUED')).toBe('PENDING');
    expect(toDbMpesaStatus('PROCESSING')).toBe('PENDING');
    expect(toDbMpesaStatus('FINALIZING')).toBe('PENDING');
    expect(toDbMpesaStatus('TIMEOUT')).toBe('FAILED');
    expect(toDbMpesaStatus('SUCCESS')).toBe('SUCCESS');
  });

  it('resolves public status from payload stage', () => {
    expect(
      resolvePublicMpesaStatus({
        status: 'PENDING',
        result_code: null,
        payload: { stage: 'QUEUED' },
      }),
    ).toBe('QUEUED');
    expect(
      resolvePublicMpesaStatus({
        status: 'PENDING',
        result_code: null,
        payload: { stage: 'WAITING_CALLBACK' },
      }),
    ).toBe('PENDING');
    expect(
      resolvePublicMpesaStatus({
        status: 'FAILED',
        result_code: 'TIMEOUT',
        payload: {},
      }),
    ).toBe('TIMEOUT');
  });
});
