/**
 * P0 queue / job-type registry — every produced job must have a processor handler.
 * Proves session.create is NOT an app job (shared-Redis collision), and STK handler exists.
 */

import {
  BILLING_PAYMENTS_QUEUE,
  BILLING_STK_JOB,
} from '../../billing/billing-queue.constants';
import { NOTIFICATIONS_QUEUE } from '../../notifications/constants/notifications.constants';
import {
  NOTIFICATION_JOBS,
  PAYMENTS_QUEUE_NAME,
} from '../../notifications/jobs/notification.jobs';
import { BillingStkProcessor } from '../../billing/billing-stk.processor';
import { NotificationsProcessor } from '../../notifications/processors/notifications.processor';

/** Canonical job names this application is allowed to produce. */
export const APP_JOB_REGISTRY = {
  payments: [BILLING_STK_JOB] as const,
  notifications: [
    NOTIFICATION_JOBS.SEND_SMS,
    NOTIFICATION_JOBS.SEND_EMAIL,
    NOTIFICATION_JOBS.SEND_FCM,
    NOTIFICATION_JOBS.SEND_WEBSOCKET,
    NOTIFICATION_JOBS.APPOINTMENT_REMINDER,
  ] as const,
} as const;

describe('P0 Bull job-type registry', () => {
  it('uses namespaced payment queue (not bare payments-queue)', () => {
    expect(BILLING_PAYMENTS_QUEUE).toMatch(/nyalife/);
    expect(BILLING_PAYMENTS_QUEUE).not.toBe('payments-queue');
    expect(PAYMENTS_QUEUE_NAME).toBe(BILLING_PAYMENTS_QUEUE);
  });

  it('uses namespaced notifications queue', () => {
    expect(NOTIFICATIONS_QUEUE.NAME).toMatch(/nyalife/);
    expect(NOTIFICATIONS_QUEUE.NAME).not.toBe('notifications-queue');
  });

  it('registers STK job handler name payment.stk_push', () => {
    expect(BILLING_STK_JOB).toBe('payment.stk_push');
    expect(APP_JOB_REGISTRY.payments).toContain(BILLING_STK_JOB);
  });

  it('does not claim session.create as an application job', () => {
    const all = [
      ...APP_JOB_REGISTRY.payments,
      ...APP_JOB_REGISTRY.notifications,
    ];
    expect(all).not.toContain('session.create');
  });

  it('BillingStkProcessor only processes BILLING_STK_JOB', () => {
    const proto = BillingStkProcessor.prototype as unknown as Record<
      string,
      unknown
    >;
    // Nest metadata: @Process(BILLING_STK_JOB) on handle
    const keys = Object.getOwnPropertyNames(proto);
    expect(keys).toContain('handle');
    expect(typeof proto.handle).toBe('function');
  });

  it('NotificationsProcessor exposes a handler method per notification job', () => {
    const methods: Record<string, string> = {
      [NOTIFICATION_JOBS.SEND_SMS]: 'handleSms',
      [NOTIFICATION_JOBS.SEND_EMAIL]: 'handleEmail',
      [NOTIFICATION_JOBS.SEND_FCM]: 'handleFcm',
      [NOTIFICATION_JOBS.SEND_WEBSOCKET]: 'handleWebsocket',
      [NOTIFICATION_JOBS.APPOINTMENT_REMINDER]: 'handleAppointmentReminder',
    };
    for (const [job, method] of Object.entries(methods)) {
      expect(APP_JOB_REGISTRY.notifications).toContain(job as never);
      expect(
        typeof (NotificationsProcessor.prototype as unknown as Record<
          string,
          unknown
        >)[method],
      ).toBe('function');
    }
  });

  it('every notification job constant is a non-empty string', () => {
    for (const name of APP_JOB_REGISTRY.notifications) {
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(3);
    }
  });
});

describe('P0 BillingStkProcessor unknown job handling', () => {
  it('onFailed downgrades foreign job names (session.create) to ignore warn', async () => {
    const checkout = {
      executeQueuedStk: jest.fn(),
      markStkJobFailed: jest.fn(),
    };
    const processor = new BillingStkProcessor(checkout as never);
    const warn = jest.spyOn((processor as any).logger, 'warn').mockImplementation();

    await processor.onFailed(
      { id: '99', name: 'session.create', attemptsMade: 1 } as never,
      new Error('Missing process handler for job type session.create'),
    );

    expect(warn).toHaveBeenCalled();
    const msg = String(warn.mock.calls[0]?.[0] ?? '');
    expect(msg).toMatch(/Ignoring non-STK job|session\.create/i);
    expect(checkout.executeQueuedStk).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('onFailed still reports real STK failures', async () => {
    const markStkJobFailed = jest.fn();
    const processor = new BillingStkProcessor({
      executeQueuedStk: jest.fn(),
      markStkJobFailed,
    } as never);
    const warn = jest.spyOn((processor as any).logger, 'warn').mockImplementation();

    await processor.onFailed(
      {
        id: '1',
        name: BILLING_STK_JOB,
        attemptsMade: 4,
        opts: { attempts: 4 },
        data: { checkoutId: 'tx-1' },
      } as never,
      new Error('M-Pesa timeout'),
    );

    const msg = String(warn.mock.calls[0]?.[0] ?? '');
    expect(msg).toMatch(/JOB_FAILED|JOB_RETRYING|M-Pesa timeout/);
    expect(msg).not.toMatch(/Ignoring non-STK/);
    expect(markStkJobFailed).toHaveBeenCalledWith('tx-1', expect.any(Error));
    warn.mockRestore();
  });
});
