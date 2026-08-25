/**
 * P1 Billing STK — enqueue → processor → status; M-Pesa failure paths.
 * Uses mocked Daraja + billing repo (no live Safaricom / no prod DB).
 */

import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Queue } from 'bull';
import { BILLING_STK_JOB } from '../billing-queue.constants';
import { BillingStkProcessor } from '../billing-stk.processor';
import { CheckoutService } from '../checkout.service';
import type { IBillingRepository } from '../repositories/billing.repository.interface';
import type { MpesaClient } from '../mpesa.client';

function baseVisitRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'visit-1',
    patient_name: 'Jane Doe',
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
    ...overrides,
  };
}

function pendingTx(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-1',
    checkout_request_id: 'ws_ABC',
    merchant_request_id: 'mr_ABC',
    phone: '254712345678',
    amount: 1500,
    account_reference: 'MRN1001',
    description: 'Outpatient bill',
    status: 'PENDING',
    result_code: null,
    result_desc: null,
    mpesa_receipt_number: null,
    visit_id: 'visit-1',
    patient_id: 'pat-1',
    source: 'RECEPTION',
    initiated_by: 'actor-1',
    payload: { lines: [{ description: 'CBC', amount: 1500 }], simulated: false },
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('P1 CheckoutService STK lifecycle', () => {
  let checkout: CheckoutService;
  let repo: {
    isConnected: jest.Mock;
    findVisitForCheckout: jest.Mock;
    createMpesaTransaction: jest.Mock;
    findMpesaById: jest.Mock;
    findMpesaByCheckoutRequestId: jest.Mock;
    updateMpesaTransaction: jest.Mock;
    findReceiptByMpesaTxId: jest.Mock;
    findPatientByMrn: jest.Mock;
    claimMpesaPending: jest.Mock;
    countReceipts: jest.Mock;
    createReceipt: jest.Mock;
    updateVisitCheckout: jest.Mock;
    findBillingAlertUserIds: jest.Mock;
  };
  let queue: { add: jest.Mock; isReady: jest.Mock; client: { status: string } };
  let events: { emit: jest.Mock };
  let billing: {
    getFeeSchedule: jest.Mock;
    priceVisitBillLines: jest.Mock;
    collectOnInvoice: jest.Mock;
    settleVisit: jest.Mock;
    resolveTaxInclusiveCharge: jest.Mock;
  };
  let mockClient: {
    configured: boolean;
    updateConfig: jest.Mock;
    stkPush: jest.Mock;
    stkQuery: jest.Mock;
  };

  beforeEach(() => {
    repo = {
      isConnected: jest.fn().mockReturnValue(true),
      findVisitForCheckout: jest.fn().mockResolvedValue(baseVisitRow()),
      createMpesaTransaction: jest.fn().mockResolvedValue(
        pendingTx({ status: 'QUEUED', checkout_request_id: 'QUEUED-tx1' }),
      ),
      findMpesaById: jest.fn().mockResolvedValue(
        pendingTx({ status: 'QUEUED', checkout_request_id: 'QUEUED-tx1' }),
      ),
      findMpesaByCheckoutRequestId: jest.fn(),
      updateMpesaTransaction: jest.fn().mockImplementation(async (id, data) =>
        pendingTx({
          id,
          status: data.status ?? 'QUEUED',
          checkout_request_id: data.checkoutRequestId ?? 'QUEUED-tx1',
          merchant_request_id: data.merchantRequestId ?? null,
          result_code: data.resultCode ?? null,
          result_desc: data.resultDesc ?? null,
          payload: data.payload ?? {},
        }),
      ),
      findReceiptByMpesaTxId: jest.fn().mockResolvedValue(null),
      findPatientByMrn: jest
        .fn()
        .mockResolvedValue({ id: 'pat-1', patient_number: 'MRN-1001' }),
      claimMpesaPending: jest.fn(),
      countReceipts: jest.fn().mockResolvedValue(0),
      createReceipt: jest.fn().mockResolvedValue({
        id: 'rcp-1',
        receipt_number: 'RCP-2026-00001',
      }),
      updateVisitCheckout: jest.fn().mockResolvedValue(undefined),
      findBillingAlertUserIds: jest.fn().mockResolvedValue(['admin-1']),
    };

    queue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
      isReady: jest.fn().mockResolvedValue(true),
      client: { status: 'ready' },
    };
    events = { emit: jest.fn() };

    const config = {
      get: (key: string) => {
        if (key === 'app.environment') return 'test';
        if (key === 'PUBLIC_URL') return 'http://localhost:4000';
        if (key === 'MPESA_ENV') return 'sandbox';
        return undefined;
      },
    } as unknown as ConfigService;

    billing = {
      getFeeSchedule: jest.fn().mockResolvedValue({ consult: 500 }),
      priceVisitBillLines: jest.fn().mockResolvedValue([
        { description: 'CBC', amount: 1500 },
      ]),
      collectOnInvoice: jest.fn().mockResolvedValue({
        totalAmount: 500,
        invoiceId: 'inv-1',
        invoiceNumber: 'INV-1',
        paymentId: 'pay-1',
      }),
      settleVisit: jest.fn().mockResolvedValue({
        totalAmount: 1500,
        invoiceId: 'inv-2',
        paymentId: 'pay-2',
      }),
      resolveTaxInclusiveCharge: jest.fn().mockImplementation(
        async (input: {
          lines: Array<{ amount: number }>;
          invoiceId?: string;
        }) => {
          const subtotal = (input.lines ?? []).reduce(
            (s, l) => s + Number(l.amount || 0),
            0,
          );
          return {
            amount: subtotal,
            subtotal: subtotal.toFixed(2),
            tax: '0.00',
            totalAmount: subtotal.toFixed(2),
            taxRatePercentage: null,
            taxCode: null,
          };
        },
      ),
    };

    checkout = new CheckoutService(
      config,
      repo as unknown as IBillingRepository,
      billing as never,
      {} as never,
      queue as unknown as Queue,
      events as unknown as EventEmitter2,
    );

    mockClient = {
      configured: false,
      updateConfig: jest.fn(),
      stkPush: jest.fn(),
      stkQuery: jest.fn(),
    };
    (checkout as unknown as { client: MpesaClient }).client =
      mockClient as unknown as MpesaClient;
  });

  it('initiateStk creates QUEUED row then enqueues payment.stk_push with checkoutId', async () => {
    const result = await checkout.initiateStk({
      visitId: 'visit-1',
      phone: '0712345678',
      source: 'RECEPTION',
      actorUserId: 'actor-1',
    });

    expect(result.queued).toBe(true);
    expect(result.paid).toBe(false);
    expect(result.checkoutId).toBe('tx-1');
    expect(result.status).toBe('QUEUED');
    expect(result.jobId).toBe('job-1');
    expect(repo.createMpesaTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'PENDING',
        phone: '254712345678',
        amount: 1500,
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      BILLING_STK_JOB,
      expect.objectContaining({
        checkoutId: 'tx-1',
        visitId: 'visit-1',
        phone: '254712345678',
        source: 'RECEPTION',
        actorUserId: 'actor-1',
      }),
      expect.objectContaining({
        jobId: 'stk-tx-1',
        attempts: 4,
        backoff: { type: 'exponential', delay: 3000 },
      }),
    );
  });

  it('initiateStk rejects invalid phone before queue', async () => {
    await expect(
      checkout.initiateStk({
        visitId: 'visit-1',
        phone: '123',
        source: 'RECEPTION',
        actorUserId: 'actor-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('initiateStk rejects visits not ready for billing', async () => {
    repo.findVisitForCheckout.mockResolvedValue(
      baseVisitRow({ stage: 'WITH_DOCTOR' }),
    );
    await expect(
      checkout.initiateStk({
        visitId: 'visit-1',
        phone: '0712345678',
        source: 'RECEPTION',
        actorUserId: 'actor-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('initiateStk rejects insurance settlement path', async () => {
    repo.findVisitForCheckout.mockResolvedValue(
      baseVisitRow({
        payload: {
          payment: { method: 'INSURANCE' },
          billing: { consultFeeStatus: 'PAID' },
        },
      }),
    );
    await expect(
      checkout.initiateStk({
        visitId: 'visit-1',
        phone: '0712345678',
        source: 'RECEPTION',
        actorUserId: 'actor-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('executeQueuedStk simulation moves QUEUED → PENDING when Daraja unset', async () => {
    mockClient.configured = false;
    repo.findMpesaById.mockResolvedValue(
      pendingTx({ status: 'QUEUED', checkout_request_id: 'QUEUED-tx1' }),
    );
    const result = await checkout.executeQueuedStk({
      checkoutId: 'tx-1',
      visitId: 'visit-1',
      phone: '254712345678',
      source: 'RECEPTION',
      actorUserId: 'actor-1',
    });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe('sandbox-sim');
    expect(result.status).toBe('PENDING');
    expect(result.paid).toBe(false);
    expect(repo.updateMpesaTransaction).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({ status: 'PENDING' }),
    );
    expect(repo.createMpesaTransaction).not.toHaveBeenCalled();
  });

  it('executeQueuedStk live path calls stkPush then updates PENDING', async () => {
    mockClient.configured = true;
    repo.findMpesaById.mockResolvedValue(
      pendingTx({ status: 'QUEUED', checkout_request_id: 'QUEUED-tx1' }),
    );
    mockClient.stkPush.mockResolvedValue({
      CheckoutRequestID: 'ws_LIVE',
      MerchantRequestID: 'mr_LIVE',
      ResponseCode: '0',
      ResponseDescription: 'Success',
      CustomerMessage: 'Success',
    });

    const result = await checkout.executeQueuedStk({
      checkoutId: 'tx-1',
      visitId: 'visit-1',
      phone: '254712345678',
      source: 'RECEPTION',
      actorUserId: 'actor-1',
    });

    expect(mockClient.stkPush).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '254712345678', amount: 1500 }),
    );
    expect(result.mode).toBe('live');
    expect(result.status).toBe('PENDING');
    expect(repo.updateMpesaTransaction).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({
        status: 'PENDING',
        checkoutRequestId: 'ws_LIVE',
        merchantRequestId: 'mr_LIVE',
      }),
    );
  });

  it('executeQueuedStk marks FAILED on permanent Daraja rejection (no retry throw)', async () => {
    mockClient.configured = true;
    repo.findMpesaById.mockResolvedValue(
      pendingTx({ status: 'QUEUED', checkout_request_id: 'QUEUED-tx1' }),
    );
    mockClient.stkPush.mockRejectedValue(new Error('M-Pesa STK failed (400)'));

    const result = await checkout.executeQueuedStk({
      checkoutId: 'tx-1',
      visitId: 'visit-1',
      phone: '254712345678',
      source: 'RECEPTION',
      actorUserId: 'actor-1',
    });

    expect(result.status).toBe('FAILED');
    expect(repo.updateMpesaTransaction).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({ status: 'FAILED' }),
    );
  });

  it('executeQueuedStk retries network-style Daraja failures', async () => {
    mockClient.configured = true;
    repo.findMpesaById.mockResolvedValue(
      pendingTx({ status: 'QUEUED', checkout_request_id: 'QUEUED-tx1' }),
    );
    mockClient.stkPush.mockRejectedValue(new Error('fetch failed'));

    await expect(
      checkout.executeQueuedStk({
        checkoutId: 'tx-1',
        visitId: 'visit-1',
        phone: '254712345678',
        source: 'RECEPTION',
        actorUserId: 'actor-1',
      }),
    ).rejects.toThrow(/fetch failed/);
  });

  it('getStatus returns terminal FAILED without re-query', async () => {
    repo.findMpesaById.mockResolvedValue(
      pendingTx({ status: 'FAILED', result_desc: 'Insufficient funds' }),
    );
    const status = await checkout.getStatus('tx-1');
    expect(status.status).toBe('FAILED');
    expect(status.paid).toBe(false);
    expect(mockClient.stkQuery).not.toHaveBeenCalled();
  });

  it('getStatus maps stkQuery non-zero ResultCode to FAILED/CANCELLED', async () => {
    mockClient.configured = true;
    repo.findMpesaById.mockResolvedValue(pendingTx());
    mockClient.stkQuery.mockResolvedValue({
      ResponseCode: '0',
      ResultCode: '1032',
      ResultDesc: 'Request cancelled by user',
    });
    repo.updateMpesaTransaction.mockResolvedValue(
      pendingTx({ status: 'CANCELLED', result_code: '1032' }),
    );

    const status = await checkout.getStatus('tx-1');
    expect(repo.updateMpesaTransaction).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({ status: 'CANCELLED', resultCode: '1032' }),
    );
    expect(status.status).toBe('CANCELLED');
  });

  it('handleCallback marks FAILED on amount mismatch', async () => {
    repo.findMpesaByCheckoutRequestId.mockResolvedValue(
      pendingTx({ amount: 1500 }),
    );
    repo.updateMpesaTransaction.mockResolvedValue(
      pendingTx({ status: 'FAILED' }),
    );

    await checkout.handleCallback({
      Body: {
        stkCallback: {
          CheckoutRequestID: 'ws_ABC',
          ResultCode: 0,
          ResultDesc: 'Success',
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: 999 },
              { Name: 'MpesaReceiptNumber', Value: 'QHX1' },
            ],
          },
        },
      },
    });

    expect(repo.updateMpesaTransaction).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({
        status: 'FAILED',
        resultCode: 'AMOUNT_MISMATCH',
      }),
    );
    expect(repo.claimMpesaPending).not.toHaveBeenCalled();
  });

  it('handleCallback marks CANCELLED on user cancel (1032)', async () => {
    repo.findMpesaByCheckoutRequestId.mockResolvedValue(pendingTx());
    repo.updateMpesaTransaction.mockResolvedValue(
      pendingTx({ status: 'CANCELLED' }),
    );

    await checkout.handleCallback({
      Body: {
        stkCallback: {
          CheckoutRequestID: 'ws_ABC',
          ResultCode: 1032,
          ResultDesc: 'Request cancelled by user',
        },
      },
    });

    expect(repo.updateMpesaTransaction).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({ status: 'CANCELLED', resultCode: '1032' }),
    );
    // cancel should not emit payment.failed
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('handleCallback marks FAILED and emits payment.failed on other codes', async () => {
    repo.findMpesaByCheckoutRequestId.mockResolvedValue(pendingTx());
    repo.updateMpesaTransaction.mockResolvedValue(
      pendingTx({ status: 'FAILED' }),
    );

    await checkout.handleCallback({
      Body: {
        stkCallback: {
          CheckoutRequestID: 'ws_ABC',
          ResultCode: 2001,
          ResultDesc: 'Insufficient balance',
        },
      },
    });

    expect(repo.updateMpesaTransaction).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({ status: 'FAILED', resultCode: '2001' }),
    );
    expect(events.emit).toHaveBeenCalled();
  });

  it('getStatus throws NotFound for unknown checkout', async () => {
    repo.findMpesaById.mockResolvedValue(null);
    await expect(checkout.getStatus('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('initiateStk rejects zero-amount checkout', async () => {
    billing.priceVisitBillLines.mockResolvedValue([]);
    billing.resolveTaxInclusiveCharge.mockResolvedValue({
      amount: 0,
      subtotal: '0.00',
      tax: '0.00',
      totalAmount: '0.00',
      taxRatePercentage: null,
      taxCode: null,
    });
    await expect(
      checkout.initiateStk({
        visitId: 'visit-1',
        phone: '0712345678',
        source: 'RECEPTION',
        actorUserId: 'actor-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('initiateStk rejects already receipted visits', async () => {
    repo.findVisitForCheckout.mockResolvedValue(
      baseVisitRow({
        stage: 'COMPLETED',
        payload: {
          payment: { method: 'CASH' },
          billing: { receiptId: 'rcp-old', consultFeeStatus: 'PAID' },
        },
      }),
    );
    await expect(
      checkout.initiateStk({
        visitId: 'visit-1',
        phone: '0712345678',
        source: 'RECEPTION',
        actorUserId: 'actor-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('executeQueuedStk → getStatus returns PENDING (status update path)', async () => {
    mockClient.configured = false;
    const queued = pendingTx({
      status: 'QUEUED',
      checkout_request_id: 'QUEUED-tx1',
      payload: { simulated: true, lines: [{ description: 'CBC', amount: 1500 }] },
      created_at: new Date(),
    });
    repo.findMpesaById.mockResolvedValue(queued);

    const executed = await checkout.executeQueuedStk({
      checkoutId: 'tx-1',
      visitId: 'visit-1',
      phone: '254712345678',
      source: 'RECEPTION',
      actorUserId: 'actor-1',
    });
    expect(executed.checkoutId).toBe('tx-1');
    expect(executed.status).toBe('PENDING');

    const pending = pendingTx({
      status: 'PENDING',
      payload: { simulated: true, lines: [{ description: 'CBC', amount: 1500 }] },
      created_at: new Date(),
    });
    repo.findMpesaById.mockResolvedValue(pending);
    const status = await checkout.getStatus('tx-1');
    expect(status.status).toBe('PENDING');
    expect(status.paid).toBe(false);
    expect(status.checkoutId).toBe('tx-1');
  });

  it('getStatus simulated auto-completes after 8s via finalizeSuccess', async () => {
    const old = pendingTx({
      status: 'PENDING',
      payload: {
        simulated: true,
        lines: [{ description: 'CBC', amount: 1500 }],
      },
      created_at: new Date(Date.now() - 9_000),
    });
    repo.findMpesaById
      .mockResolvedValueOnce(old)
      .mockResolvedValueOnce(pendingTx({ status: 'SUCCESS' }));
    repo.claimMpesaPending.mockResolvedValue(old);
    repo.updateMpesaTransaction.mockResolvedValue(
      pendingTx({ status: 'SUCCESS' }),
    );

    const status = await checkout.getStatus('tx-1');
    expect(repo.claimMpesaPending).toHaveBeenCalled();
    expect(billing.settleVisit).toHaveBeenCalled();
    expect(status.paid).toBe(true);
    expect(status.status).toBe('SUCCESS');
    expect(events.emit).toHaveBeenCalled();
  });

  it('getStatus stkQuery ResultCode 0 finalizes success', async () => {
    mockClient.configured = true;
    const tx = pendingTx({
      payload: { simulated: false, lines: [{ description: 'CBC', amount: 1500 }] },
    });
    repo.findMpesaById
      .mockResolvedValueOnce(tx)
      .mockResolvedValueOnce(pendingTx({ status: 'SUCCESS' }));
    mockClient.stkQuery.mockResolvedValue({
      ResponseCode: '0',
      ResultCode: '0',
      ResultDesc: 'The service request is processed successfully.',
    });
    repo.claimMpesaPending.mockResolvedValue(tx);
    repo.updateMpesaTransaction.mockResolvedValue(
      pendingTx({ status: 'SUCCESS' }),
    );

    const status = await checkout.getStatus('tx-1');
    expect(mockClient.stkQuery).toHaveBeenCalledWith('ws_ABC');
    expect(repo.claimMpesaPending).toHaveBeenCalled();
    expect(status.status).toBe('SUCCESS');
  });

  it('handleCallback success with matching amount finalizes and updates status', async () => {
    const tx = pendingTx({
      amount: 1500,
      payload: { lines: [{ description: 'CBC', amount: 1500 }] },
    });
    repo.findMpesaByCheckoutRequestId.mockResolvedValue(tx);
    repo.claimMpesaPending.mockResolvedValue(tx);
    repo.updateMpesaTransaction.mockResolvedValue(
      pendingTx({ status: 'SUCCESS', mpesa_receipt_number: 'QHX99' }),
    );
    repo.findMpesaById.mockResolvedValue(
      pendingTx({ status: 'SUCCESS', mpesa_receipt_number: 'QHX99' }),
    );

    await checkout.handleCallback({
      Body: {
        stkCallback: {
          CheckoutRequestID: 'ws_ABC',
          ResultCode: 0,
          ResultDesc: 'Success',
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: 1500 },
              { Name: 'MpesaReceiptNumber', Value: 'QHX99' },
            ],
          },
        },
      },
    });

    expect(repo.claimMpesaPending).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({ resultCode: 'FINALIZING' }),
    );
    expect(billing.settleVisit).toHaveBeenCalled();
    expect(repo.createReceipt).toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith(
      'payment.received',
      expect.objectContaining({ type: 'payment.received' }),
    );
  });

  it('getStatus maps stkQuery non-cancel failure to FAILED', async () => {
    mockClient.configured = true;
    repo.findMpesaById.mockResolvedValue(pendingTx());
    mockClient.stkQuery.mockResolvedValue({
      ResponseCode: '0',
      ResultCode: '2001',
      ResultDesc: 'Insufficient balance',
    });
    repo.updateMpesaTransaction.mockResolvedValue(
      pendingTx({ status: 'FAILED', result_code: '2001' }),
    );

    const status = await checkout.getStatus('tx-1');
    expect(repo.updateMpesaTransaction).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({ status: 'FAILED', resultCode: '2001' }),
    );
    expect(status.status).toBe('FAILED');
  });

  it('getReceipt returns payment context and patient details', async () => {
    (repo as any).findReceiptById = jest.fn().mockResolvedValue({
      id: 'rcp-1',
      receipt_number: 'RCP-1',
      channel: 'MPESA',
      amount: 1500,
      issued_at: new Date('2026-08-01T10:00:00.000Z'),
      visit_id: 'visit-1',
      invoice_id: 'inv-1',
      payment_id: 'pay-1',
      patient_id: 'pat-1',
      line_items: [{ description: 'CBC', amount: 1500 }],
      meta: {
        invoiceNumber: 'INV-1',
        previousPaid: 0,
        currentPayment: 1500,
        balance: 0,
        mrn: 'MRN-1001',
        patientName: 'Jane Doe',
        phone: '254712345678',
      },
    });
    (repo as any).findPatientForReceipt = jest.fn().mockResolvedValue({
      patient_number: 'MRN-1001',
      profile: {
        first_name: 'Jane',
        last_name: 'Doe',
        phone: '254712345678',
      },
    });

    const receipt = await checkout.getReceipt('rcp-1');
    expect(receipt.receiptNumber).toBe('RCP-1');
    expect(receipt.paymentContext.invoiceTotal).toBe(1500);
    expect(receipt.patient.name).toBe('Jane Doe');

    (repo as any).findReceiptById.mockResolvedValue(null);
    await expect(checkout.getReceipt('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('handleCallback enforces configured secret and ignores missing stk body', async () => {
    const secretConfig = {
      get: (key: string) => {
        if (key === 'MPESA_CALLBACK_SECRET') return 's3cret';
        if (key === 'app.environment') return 'test';
        return undefined;
      },
    } as unknown as ConfigService;
    const secured = new CheckoutService(
      secretConfig,
      repo as unknown as IBillingRepository,
      billing as never,
      {} as never,
      queue as unknown as Queue,
      events as unknown as EventEmitter2,
    );
    (secured as unknown as { client: MpesaClient }).client =
      mockClient as unknown as MpesaClient;

    await expect(secured.handleCallback({ Body: {} })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      secured.handleCallback(
        { Body: {} },
        { secretQuery: 'wrong' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      secured.handleCallback({ Body: {} }, { secretHeader: 's3cret' }),
    ).resolves.toEqual({ ResultCode: 0, ResultDesc: 'Accepted' });
  });

  it('finalizes consult-fee checkout via collectOnInvoice', async () => {
    const tx = pendingTx({
      amount: 500,
      payload: {
        purpose: 'CONSULT_FEE',
        invoiceId: 'inv-1',
        lines: [{ description: 'Consultation', amount: 500 }],
      },
    });
    repo.findVisitForCheckout.mockResolvedValue(
      baseVisitRow({
        stage: 'AWAITING_PAYMENT',
        payload: {
          payment: { method: 'CASH' },
          billing: { invoiceId: 'inv-1', consultFeeStatus: 'PENDING' },
        },
      }),
    );
    repo.claimMpesaPending.mockResolvedValue(tx);
    repo.findMpesaById.mockResolvedValue(
      pendingTx({ status: 'SUCCESS', mpesa_receipt_number: 'CONSULT1' }),
    );
    repo.updateMpesaTransaction.mockResolvedValue(
      pendingTx({ status: 'SUCCESS' }),
    );

    const status = await (
      checkout as unknown as {
        finalizeSuccess: (
          id: string,
          info: { mpesaReceipt?: string; resultDesc?: string },
        ) => Promise<{ status: string }>;
      }
    ).finalizeSuccess('tx-1', {
      mpesaReceipt: 'CONSULT1',
      resultDesc: 'Paid',
    });

    expect(billing.collectOnInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: 'inv-1', mode: 'MPESA' }),
    );
    expect(repo.createReceipt).toHaveBeenCalled();
    expect(repo.updateVisitCheckout).toHaveBeenCalledWith(
      'visit-1',
      expect.objectContaining({ stage: 'CHECKED_IN' }),
    );
    expect(status.status).toBe('SUCCESS');
  });

  it('finalizeSuccess returns existing status when claim loses the race', async () => {
    repo.claimMpesaPending.mockResolvedValue(null);
    repo.findMpesaById.mockResolvedValue(pendingTx({ status: 'SUCCESS' }));
    repo.findReceiptByMpesaTxId.mockResolvedValue({ id: 'rcp-existing' });

    const status = await (
      checkout as unknown as {
        finalizeSuccess: (
          id: string,
          info: { mpesaReceipt?: string },
        ) => Promise<{ status: string; receiptId?: string }>;
      }
    ).finalizeSuccess('tx-1', { mpesaReceipt: 'R1' });

    expect(status.status).toBe('SUCCESS');
    expect(status.receiptId).toBe('rcp-existing');
  });
});

describe('P1 BillingStkProcessor → CheckoutService', () => {
  it('processor handle delegates to executeQueuedStk', async () => {
    const executeQueuedStk = jest.fn().mockResolvedValue({
      ok: true,
      checkoutId: 'tx-1',
      status: 'PENDING',
    });
    const processor = new BillingStkProcessor({
      executeQueuedStk,
      markStkJobFailed: jest.fn(),
    } as never);

    await processor.handle({
      id: '1',
      name: BILLING_STK_JOB,
      data: {
        checkoutId: 'tx-1',
        visitId: 'visit-1',
        phone: '254712345678',
        source: 'RECEPTION',
        actorUserId: 'actor-1',
        dedupeKey: 'stk:visit-1',
      },
      attemptsMade: 0,
      opts: { attempts: 4 },
      discard: jest.fn(),
    } as never);

    expect(executeQueuedStk).toHaveBeenCalledWith({
      checkoutId: 'tx-1',
      visitId: 'visit-1',
      phone: '254712345678',
      source: 'RECEPTION',
      actorUserId: 'actor-1',
    });
  });

  it('processor surfaces executeQueuedStk errors for Bull retry', async () => {
    const processor = new BillingStkProcessor({
      executeQueuedStk: jest
        .fn()
        .mockRejectedValue(new Error('M-Pesa STK failed (503)')),
      markStkJobFailed: jest.fn(),
    } as never);

    await expect(
      processor.handle({
        id: '2',
        name: BILLING_STK_JOB,
        data: {
          checkoutId: 'tx-1',
          visitId: 'visit-1',
          phone: '254712345678',
          source: 'RECEPTION',
          actorUserId: 'actor-1',
          dedupeKey: 'stk:v1',
        },
        attemptsMade: 0,
        opts: { attempts: 4 },
        discard: jest.fn(),
      } as never),
    ).rejects.toThrow(/M-Pesa STK failed/);
  });
});
