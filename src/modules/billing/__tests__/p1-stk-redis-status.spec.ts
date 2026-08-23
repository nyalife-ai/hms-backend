/**
 * P1 STK Redis chain — initiate enqueue → processor → PENDING status.
 */

import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import Queue from 'bull';
import {
  BILLING_PAYMENTS_QUEUE,
  BILLING_STK_JOB,
} from '../billing-queue.constants';
import { BillingStkProcessor } from '../billing-stk.processor';
import { CheckoutService } from '../checkout.service';
import type { IBillingRepository } from '../repositories/billing.repository.interface';
import type { MpesaClient } from '../mpesa.client';

describe('P1 STK Redis enqueue → process → status', () => {
  let queue: Queue.Queue;
  let checkout: CheckoutService;
  let findMpesaById: jest.Mock;
  let createMpesaTransaction: jest.Mock;

  beforeAll(async () => {
    const host = process.env.REDIS_HOST || '127.0.0.1';
    const port = Number(process.env.REDIS_PORT || 6379);
    const prefix = process.env.BULL_PREFIX || 'nyalife-test';
    queue = new Queue(BILLING_PAYMENTS_QUEUE, {
      prefix,
      redis: {
        host,
        port,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      },
    });
    await queue.isReady();
    await queue.empty();

    createMpesaTransaction = jest.fn().mockResolvedValue({
      id: 'tx-redis-1',
      checkout_request_id: 'SIM-REDIS',
      merchant_request_id: 'SIM-MR',
      phone: '254712345678',
      amount: 1500,
      account_reference: 'MRN1001',
      description: 'Outpatient bill',
      status: 'PENDING',
      result_code: null,
      result_desc: null,
      mpesa_receipt_number: null,
      visit_id: 'visit-redis-1',
      patient_id: 'pat-1',
      source: 'RECEPTION',
      initiated_by: 'actor-1',
      payload: { simulated: true, lines: [{ description: 'CBC', amount: 1500 }] },
      created_at: new Date(),
      updated_at: new Date(),
    });
    findMpesaById = jest.fn().mockImplementation(async () =>
      createMpesaTransaction.mock.results[
        createMpesaTransaction.mock.results.length - 1
      ]?.value,
    );

    const repo = {
      isConnected: () => true,
      findVisitForCheckout: jest.fn().mockResolvedValue({
        id: 'visit-redis-1',
        patient_name: 'Jane',
        mrn: 'MRN-1001',
        age: 30,
        gender: 'Female',
        phone: '254712345678',
        first_visit: true,
        stage: 'READY_FOR_BILLING',
        checked_in_at: new Date(),
        payload: {
          payment: { method: 'CASH' },
          billing: { consultFeeStatus: 'PAID' },
          labOrder: { tests: [{ name: 'CBC' }] },
          prescriptions: [],
        },
      }),
      createMpesaTransaction,
      findMpesaById,
      findPatientByMrn: jest
        .fn()
        .mockResolvedValue({ id: 'pat-1', patient_number: 'MRN-1001' }),
      findMpesaByCheckoutRequestId: jest.fn(),
      updateMpesaTransaction: jest.fn(),
      findReceiptByMpesaTxId: jest.fn().mockResolvedValue(null),
      claimMpesaPending: jest.fn(),
    };

    checkout = new CheckoutService(
      {
        get: (key: string) => {
          if (key === 'app.environment') return 'test';
          if (key === 'PUBLIC_URL') return 'http://localhost:4000';
          if (key === 'MPESA_ENV') return 'sandbox';
          return undefined;
        },
      } as unknown as ConfigService,
      repo as unknown as IBillingRepository,
      {
        getFeeSchedule: jest.fn().mockResolvedValue({ consult: 500 }),
        priceVisitBillLines: jest
          .fn()
          .mockResolvedValue([{ description: 'CBC', amount: 1500 }]),
      } as never,
      {} as never,
      queue as never,
      { emit: jest.fn() } as unknown as EventEmitter2,
    );

    (checkout as unknown as { client: MpesaClient }).client = {
      configured: false,
      updateConfig: jest.fn(),
      stkPush: jest.fn(),
      stkQuery: jest.fn(),
    } as unknown as MpesaClient;
  });

  afterAll(async () => {
    await queue.close();
  });

  it('initiateStk enqueues on Redis; processor creates PENDING; getStatus PENDING', async () => {
    const initiated = await checkout.initiateStk({
      visitId: 'visit-redis-1',
      phone: '0712345678',
      source: 'RECEPTION',
      actorUserId: 'actor-1',
    });
    expect(initiated.queued).toBe(true);

    const waiting = await queue.getWaiting();
    const job =
      waiting.find((j) => j.name === BILLING_STK_JOB) ||
      (await queue.getJob(initiated.jobId));
    expect(job).toBeTruthy();
    expect(job!.name).toBe(BILLING_STK_JOB);

    const processor = new BillingStkProcessor(checkout);
    const executed = await processor.handle(job as never);
    expect(executed.ok).toBe(true);
    expect(executed.checkoutId).toBe('tx-redis-1');
    expect(createMpesaTransaction).toHaveBeenCalled();

    const status = await checkout.getStatus('tx-redis-1');
    expect(status.status).toBe('PENDING');
    expect(status.paid).toBe(false);
    expect(status.checkoutId).toBe('tx-redis-1');

    await job!.remove().catch(() => undefined);
  });
});
