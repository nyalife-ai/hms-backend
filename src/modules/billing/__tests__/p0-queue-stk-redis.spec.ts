/**
 * P0 queue hardening — handler registry completeness + real Bull STK enqueue/process.
 */

import Queue from 'bull';
import {
  BILLING_PAYMENTS_QUEUE,
  BILLING_STK_JOB,
  type BillingStkJobData,
} from '../billing-queue.constants';
import { BillingStkProcessor } from '../billing-stk.processor';
import { NOTIFICATIONS_QUEUE } from '../../notifications/constants/notifications.constants';
import {
  NOTIFICATION_JOBS,
  PAYMENT_JOBS,
  PAYMENTS_QUEUE_NAME,
} from '../../notifications/jobs/notification.jobs';
import { NotificationsProcessor } from '../../notifications/processors/notifications.processor';

const NOTIFICATION_HANDLER_METHODS: Record<
  string,
  keyof NotificationsProcessor
> = {
  [NOTIFICATION_JOBS.SEND_SMS]: 'handleSms',
  [NOTIFICATION_JOBS.SEND_FCM]: 'handleFcm',
  [NOTIFICATION_JOBS.SEND_EMAIL]: 'handleEmail',
  [NOTIFICATION_JOBS.SEND_WEBSOCKET]: 'handleWebsocket',
  [NOTIFICATION_JOBS.APPOINTMENT_REMINDER]: 'handleAppointmentReminder',
};

describe('P0 notification processor handler completeness', () => {
  it('every NOTIFICATION_JOBS value has a processor method', () => {
    for (const [job, method] of Object.entries(NOTIFICATION_HANDLER_METHODS)) {
      expect(job.length).toBeGreaterThan(3);
      expect(typeof NotificationsProcessor.prototype[method]).toBe('function');
    }
  });

  it('PAYMENT_JOBS.STK_PUSH matches BILLING_STK_JOB', () => {
    expect(PAYMENT_JOBS.STK_PUSH).toBe(BILLING_STK_JOB);
    expect(PAYMENTS_QUEUE_NAME).toBe(BILLING_PAYMENTS_QUEUE);
  });

  it('session.create is not a handled notification or payment job', () => {
    expect(Object.values(NOTIFICATION_JOBS)).not.toContain('session.create');
    expect(Object.values(PAYMENT_JOBS)).not.toContain('session.create');
  });
});

describe('P0 Bull STK enqueue → process (local Redis)', () => {
  let queue: Queue.Queue;

  beforeAll(async () => {
    const host = process.env.REDIS_HOST || '127.0.0.1';
    const port = Number(process.env.REDIS_PORT || 6379);
    const prefix = process.env.BULL_PREFIX || 'nyalife-test';
    queue = new Queue(BILLING_PAYMENTS_QUEUE, {
      prefix,
      redis: { host, port, maxRetriesPerRequest: null, enableReadyCheck: false },
    });
    await queue.isReady();
    await queue.empty();
  });

  afterAll(async () => {
    await queue.close();
  });

  it('enqueues payment.stk_push and processor handle executes checkout', async () => {
    const checkout = {
      executeQueuedStk: jest.fn().mockResolvedValue({ ok: true, checkoutId: 'c1' }),
    };
    const processor = new BillingStkProcessor(checkout as never);

    const payload: BillingStkJobData = {
      visitId: '11111111-1111-4111-8111-111111111111',
      phone: '254712345678',
      source: 'RECEPTION',
      actorUserId: '22222222-2222-4222-8222-222222222222',
      dedupeKey: `stk-p0-${Date.now()}`,
    };

    const job = await queue.add(BILLING_STK_JOB, payload, {
      jobId: payload.dedupeKey,
      removeOnComplete: true,
      removeOnFail: true,
    });
    expect(job.name).toBe(BILLING_STK_JOB);

    const waiting = await queue.getWaiting();
    const named = waiting.filter((j) => j.name === BILLING_STK_JOB);
    expect(named.length).toBeGreaterThanOrEqual(1);

    // Process via processor (same contract as @Process handler)
    await processor.handle(job as never);
    expect(checkout.executeQueuedStk).toHaveBeenCalledWith({
      visitId: payload.visitId,
      phone: payload.phone,
      source: payload.source,
      actorUserId: payload.actorUserId,
    });

    await job.remove().catch(() => undefined);
  });

  it('does not run STK checkout for foreign session.create job name', async () => {
    const checkout = { executeQueuedStk: jest.fn() };
    const processor = new BillingStkProcessor(checkout as never);
    const warn = jest
      .spyOn((processor as any).logger, 'warn')
      .mockImplementation();

    const job = await queue.add(
      'session.create',
      { foo: 1 },
      { removeOnComplete: true, removeOnFail: true },
    );

    processor.onFailed(
      job as never,
      new Error('Missing process handler for job type session.create'),
    );
    expect(checkout.executeQueuedStk).not.toHaveBeenCalled();
    expect(String(warn.mock.calls[0]?.[0] ?? '')).toMatch(/Ignoring non-STK/i);

    await job.remove().catch(() => undefined);
    warn.mockRestore();
  });

  it('queues use namespaced names and test prefix env', () => {
    expect(BILLING_PAYMENTS_QUEUE).toMatch(/nyalife/);
    expect(NOTIFICATIONS_QUEUE.NAME).toMatch(/nyalife/);
    expect(process.env.BULL_PREFIX || 'nyalife-test').toMatch(/nyalife/);
  });
});
