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
  };
  let queue: { add: jest.Mock };
  let events: { emit: jest.Mock };
  let billing: {
    getFeeSchedule: jest.Mock;
    priceVisitBillLines: jest.Mock;
    collectOnInvoice: jest.Mock;
    settleVisit: jest.Mock;
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
      createMpesaTransaction: jest.fn().mockResolvedValue(pendingTx()),
      findMpesaById: jest.fn(),
      findMpesaByCheckoutRequestId: jest.fn(),
      updateMpesaTransaction: jest.fn(),
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
    };

    queue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
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

  it('initiateStk enqueues payment.stk_push with retries', async () => {
    const result = await checkout.initiateStk({
      visitId: 'visit-1',
      phone: '0712345678',
      source: 'RECEPTION',
      actorUserId: 'actor-1',
    });

    expect(result.queued).toBe(true);
    expect(result.jobId).toBe('job-1');
    expect(queue.add).toHaveBeenCalledWith(
      BILLING_STK_JOB,
      expect.objectContaining({
        visitId: 'visit-1',
        phone: '254712345678',
        source: 'RECEPTION',
        actorUserId: 'actor-1',
      }),
      expect.objectContaining({
        attempts: 4,
        backoff: { type: 'exponential', delay: 3000 },
      }),
    );
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

  it('executeQueuedStk simulation creates PENDING checkout when Daraja unset', async () => {
    mockClient.configured = false;
    const result = await checkout.executeQueuedStk({
      visitId: 'visit-1',
      phone: '254712345678',
      source: 'RECEPTION',
      actorUserId: 'actor-1',
    });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe('sandbox-sim');
    expect(repo.createMpesaTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '254712345678',
        amount: 1500,
        visitId: 'visit-1',
        payload: expect.objectContaining({ simulated: true }),
      }),
    );
  });

  it('executeQueuedStk live path calls stkPush then persists PENDING', async () => {
    mockClient.configured = true;
    mockClient.stkPush.mockResolvedValue({
      CheckoutRequestID: 'ws_LIVE',
      MerchantRequestID: 'mr_LIVE',
      ResponseCode: '0',
      ResponseDescription: 'Success',
      CustomerMessage: 'Success',
    });

    const result = await checkout.executeQueuedStk({
      visitId: 'visit-1',
      phone: '254712345678',
      source: 'RECEPTION',
      actorUserId: 'actor-1',
    });

    expect(mockClient.stkPush).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '254712345678', amount: 1500 }),
    );
    expect(result.mode).toBe('live');
    expect(repo.createMpesaTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        checkoutRequestId: 'ws_LIVE',
        merchantRequestId: 'mr_LIVE',
        payload: expect.objectContaining({ simulated: false }),
      }),
    );
  });

  it('executeQueuedStk propagates M-Pesa stkPush failure (no orphan tx)', async () => {
    mockClient.configured = true;
    mockClient.stkPush.mockRejectedValue(new Error('M-Pesa STK failed (500)'));

    await expect(
      checkout.executeQueuedStk({
        visitId: 'visit-1',
        phone: '254712345678',
        source: 'RECEPTION',
        actorUserId: 'actor-1',
      }),
    ).rejects.toThrow(/M-Pesa STK failed/);

    expect(repo.createMpesaTransaction).not.toHaveBeenCalled();
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
    const created = pendingTx({
      status: 'PENDING',
      payload: { simulated: true, lines: [{ description: 'CBC', amount: 1500 }] },
      created_at: new Date(),
    });
    repo.createMpesaTransaction.mockResolvedValue(created);

    const executed = await checkout.executeQueuedStk({
      visitId: 'visit-1',
      phone: '254712345678',
      source: 'RECEPTION',
      actorUserId: 'actor-1',
    });
    expect(executed.checkoutId).toBe('tx-1');

    repo.findMpesaById.mockResolvedValue(created);
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
      expect.objectContaining({ status: 'FINALIZING' }),
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
});

describe('P1 BillingStkProcessor → CheckoutService', () => {
  it('processor handle delegates to executeQueuedStk', async () => {
    const executeQueuedStk = jest.fn().mockResolvedValue({
      ok: true,
      checkoutId: 'tx-1',
    });
    const processor = new BillingStkProcessor({
      executeQueuedStk,
    } as never);

    await processor.handle({
      id: '1',
      name: BILLING_STK_JOB,
      data: {
        visitId: 'visit-1',
        phone: '254712345678',
        source: 'RECEPTION',
        actorUserId: 'actor-1',
        dedupeKey: 'stk:visit-1',
      },
    } as never);

    expect(executeQueuedStk).toHaveBeenCalledWith({
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
    } as never);

    await expect(
      processor.handle({
        id: '2',
        name: BILLING_STK_JOB,
        data: {
          visitId: 'visit-1',
          phone: '254712345678',
          source: 'RECEPTION',
          actorUserId: 'actor-1',
          dedupeKey: 'stk:v1',
        },
      } as never),
    ).rejects.toThrow(/M-Pesa STK failed/);
  });
});
