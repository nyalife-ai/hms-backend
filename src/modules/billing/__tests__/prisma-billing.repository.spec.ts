/**
 * PrismaBillingRepository — settle, claims, M-Pesa, receipts with mocks.
 */

import { PrismaBillingRepository } from '../repositories/prisma-billing.repository';

jest.mock('../finance/ensure-foundation', () => ({
  ensureBillingFoundation: jest.fn().mockResolvedValue(undefined),
}));

describe('PrismaBillingRepository', () => {
  let prisma: any;
  let repo: PrismaBillingRepository;
  const PATIENT = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const INV = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const PAY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const CLAIM = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const MPESA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

  beforeEach(() => {
    prisma = {
      isConnected: true,
      services: { findMany: jest.fn() },
      patients: { findUnique: jest.fn() },
      invoices: { count: jest.fn(), create: jest.fn(), update: jest.fn() },
      payments: { count: jest.fn(), create: jest.fn() },
      paymentMethods: { findUnique: jest.fn() },
      paymentAllocations: { create: jest.fn() },
      insurancePolicies: { findFirst: jest.fn(), create: jest.fn() },
      insuranceClaims: {
        count: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      outpatientVisits: { findUnique: jest.fn(), update: jest.fn() },
      mpesaTransactions: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      receipts: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    repo = new PrismaBillingRepository(prisma);
  });

  it('isConnected / findActiveServicePrices / findPatientByMrn / countInvoices', async () => {
    expect(repo.isConnected()).toBe(true);
    prisma.services.findMany.mockResolvedValue([{ service_code: 'CONSULT' }]);
    await repo.findActiveServicePrices(['CONSULT']);
    expect(prisma.services.findMany).toHaveBeenCalled();

    prisma.patients.findUnique.mockResolvedValue({ id: PATIENT, patient_number: 'MRN-1' });
    expect((await repo.findPatientByMrn('MRN-1'))?.id).toBe(PATIENT);

    prisma.invoices.count.mockResolvedValue(5);
    expect(await repo.countInvoices()).toBe(5);
  });

  it('ensureFeeScheduleSeed no-ops when disconnected', async () => {
    prisma.isConnected = false;
    await repo.ensureFeeScheduleSeed();
    const { ensureBillingFoundation } = jest.requireMock('../finance/ensure-foundation');
    expect(ensureBillingFoundation).not.toHaveBeenCalled();
    prisma.isConnected = true;
    await repo.ensureFeeScheduleSeed();
    expect(ensureBillingFoundation).toHaveBeenCalled();
  });

  it('settleVisit cash path creates invoice payment allocation', async () => {
    prisma.patients.findUnique.mockResolvedValue({
      id: PATIENT,
      patient_number: 'MRN-1',
    });
    prisma.invoices.count.mockResolvedValue(0);
    prisma.invoices.create.mockResolvedValue({ id: INV });
    prisma.paymentMethods.findUnique.mockResolvedValue({ id: 'pm-cash' });
    prisma.payments.count.mockResolvedValue(0);
    prisma.payments.create.mockResolvedValue({ id: PAY });
    prisma.paymentAllocations.create.mockResolvedValue({});

    const result = await repo.settleVisit({
      createdByUserId: 'u1',
      mrn: 'MRN-1',
      patientName: 'Amina',
      lines: [{ description: 'Consult', amount: 1000 }],
      total: 1000,
      mode: 'CASH',
      diagnosis: 'ANC',
    });
    expect(result).toEqual({
      invoiceId: INV,
      invoiceNumber: expect.stringMatching(/^INV-\d{4}-0001$/),
      paymentId: PAY,
    });
  });

  it('settleVisit MPESA and CLAIM paths', async () => {
    prisma.patients.findUnique.mockResolvedValue({
      id: PATIENT,
      patient_number: 'MRN-1',
    });
    prisma.invoices.count.mockResolvedValue(1);
    prisma.invoices.create.mockResolvedValue({ id: INV });
    prisma.paymentMethods.findUnique.mockResolvedValue({ id: 'pm-mpesa' });
    prisma.payments.count.mockResolvedValue(1);
    prisma.payments.create.mockResolvedValue({ id: PAY });
    prisma.paymentAllocations.create.mockResolvedValue({});

    const mpesa = await repo.settleVisit({
      createdByUserId: 'u1',
      mrn: 'MRN-1',
      patientName: 'Amina',
      lines: [{ description: 'Lab', amount: 500 }],
      total: 500,
      mode: 'MPESA',
      mpesaReceipt: 'RH123',
      transactionReference: 'ref-1',
    });
    expect(mpesa.paymentId).toBe(PAY);

    prisma.insurancePolicies.findFirst.mockResolvedValue(null);
    prisma.insurancePolicies.create.mockResolvedValue({ id: 'pol-1' });
    prisma.insuranceClaims.count.mockResolvedValue(0);
    prisma.insuranceClaims.create.mockResolvedValue({
      id: CLAIM,
      claim_number: 'EXT-1',
    });

    const claim = await repo.settleVisit({
      createdByUserId: 'u1',
      mrn: 'MRN-1',
      patientName: 'Amina',
      lines: [{ description: 'Xray', amount: 2000 }],
      total: 2000,
      mode: 'CLAIM',
      providerId: 'prov-1',
      policyNumber: 'POL-9',
      claimExternalId: 'EXT-1',
    });
    expect(claim.claimDbId).toBe(CLAIM);
    expect(claim.claimNumber).toBe('EXT-1');
    expect(prisma.insuranceClaims.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ claim_number: 'EXT-1' }),
      }),
    );
  });

  it('settleVisit throws when patient missing and reuses existing policy', async () => {
    prisma.patients.findUnique.mockResolvedValue(null);
    await expect(
      repo.settleVisit({
        createdByUserId: 'u1',
        mrn: 'MISSING',
        patientName: 'X',
        lines: [],
        total: 0,
        mode: 'CASH',
      }),
    ).rejects.toThrow(/not found/);

    prisma.patients.findUnique.mockResolvedValue({
      id: PATIENT,
      patient_number: 'MRN-1',
    });
    prisma.invoices.count.mockResolvedValue(2);
    prisma.invoices.create.mockResolvedValue({ id: INV });
    prisma.insurancePolicies.findFirst.mockResolvedValue({ id: 'pol-existing' });
    prisma.insuranceClaims.count.mockResolvedValue(2);
    prisma.insuranceClaims.create.mockResolvedValue({
      id: CLAIM,
      claim_number: 'CLM-2026-0003',
    });
    const claim = await repo.settleVisit({
      createdByUserId: 'u1',
      mrn: 'MRN-1',
      patientName: 'Amina',
      lines: [{ description: 'Svc', amount: 100 }],
      total: 100,
      mode: 'CLAIM',
      providerId: 'prov-1',
      policyNumber: 'POL-1',
    });
    expect(claim.claimNumber).toBe('CLM-2026-0003');
    expect(prisma.insurancePolicies.create).not.toHaveBeenCalled();
  });

  it('syncClaimStatus maps gateway statuses and marks invoice paid on accept', async () => {
    prisma.isConnected = false;
    await repo.syncClaimStatus('CLM-1', 'ACCEPTED');
    expect(prisma.insuranceClaims.updateMany).not.toHaveBeenCalled();

    prisma.isConnected = true;
    prisma.insuranceClaims.updateMany.mockResolvedValue({ count: 1 });
    prisma.insuranceClaims.findFirst.mockResolvedValue({
      id: CLAIM,
      invoice_id: INV,
      amount_claimed: 1000,
    });
    prisma.insuranceClaims.update.mockResolvedValue({});
    prisma.invoices.update.mockResolvedValue({});

    await repo.syncClaimStatus('CLM-1', 'REJECTED');
    expect(prisma.insuranceClaims.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'DENIED',
          denial_reason: 'Denied by insurer',
        }),
      }),
    );

    await repo.syncClaimStatus('CLM-1', 'ACCEPTED');
    expect(prisma.invoices.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PAID' } }),
    );

    prisma.insuranceClaims.findFirst.mockResolvedValue(null);
    await repo.syncClaimStatus('CLM-2', 'SUBMITTED');
  });

  it('checkout + mpesa + receipt helpers', async () => {
    prisma.outpatientVisits.findUnique.mockResolvedValue({ id: 'v1' });
    expect(await repo.findVisitForCheckout('v1')).toEqual({ id: 'v1' });
    prisma.outpatientVisits.update.mockResolvedValue({});
    await repo.updateVisitCheckout('v1', { stage: 'BILLED', payload: { x: 1 } });

    prisma.mpesaTransactions.create.mockResolvedValue({ id: MPESA });
    await repo.createMpesaTransaction({
      checkoutRequestId: 'chk-1',
      merchantRequestId: 'm-1',
      phone: '2547',
      amount: 100,
      accountReference: 'MRN-1',
      description: 'pay',
      visitId: 'v1',
      patientId: PATIENT,
      source: 'checkout',
      initiatedBy: 'u1',
      payload: {},
    });

    prisma.mpesaTransactions.findUnique.mockResolvedValue({ id: MPESA });
    expect(await repo.findMpesaById(MPESA)).toEqual({ id: MPESA });
    expect(await repo.findMpesaByCheckoutRequestId('chk-1')).toEqual({ id: MPESA });

    prisma.mpesaTransactions.update.mockResolvedValue({ id: MPESA, status: 'SUCCESS' });
    await repo.updateMpesaTransaction(MPESA, {
      status: 'SUCCESS',
      resultCode: '0',
      resultDesc: 'ok',
      mpesaReceiptNumber: 'RH1',
      payload: { ok: true },
    });

    prisma.mpesaTransactions.updateMany.mockResolvedValue({ count: 0 });
    expect(
      await repo.claimMpesaPending(MPESA, { status: 'SUCCESS' }),
    ).toBeNull();
    prisma.mpesaTransactions.updateMany.mockResolvedValue({ count: 1 });
    expect(await repo.claimMpesaPending(MPESA, { status: 'SUCCESS' })).toEqual({
      id: MPESA,
    });

    prisma.receipts.findFirst.mockResolvedValue({ id: 'r1' });
    prisma.receipts.findUnique.mockResolvedValue({ id: 'r1' });
    prisma.receipts.count.mockResolvedValue(3);
    prisma.receipts.create.mockResolvedValue({ id: 'r1' });
    expect(await repo.findReceiptByMpesaTxId(MPESA)).toEqual({ id: 'r1' });
    expect(await repo.findReceiptById('r1')).toEqual({ id: 'r1' });
    expect(await repo.countReceipts()).toBe(3);
    await repo.createReceipt({
      receiptNumber: 'RCP-1',
      patientId: PATIENT,
      visitId: 'v1',
      invoiceId: INV,
      mpesaTransactionId: MPESA,
      channel: 'MPESA',
      amount: 100,
      issuedBy: 'u1',
      lineItems: [],
      meta: {},
    });

    prisma.patients.findUnique.mockResolvedValueOnce(null);
    expect(await repo.findPatientForReceipt(PATIENT)).toBeNull();

    prisma.patients.findUnique.mockResolvedValueOnce({
      patient_number: 'MRN-1',
      user: {
        core_profiles_user_id: [
          { first_name: 'Amina', last_name: 'W', phone: '0700' },
        ],
      },
    });
    expect(await repo.findPatientForReceipt(PATIENT)).toEqual({
      patient_number: 'MRN-1',
      profile: { first_name: 'Amina', last_name: 'W', phone: '0700' },
    });

    prisma.patients.findUnique.mockResolvedValueOnce({
      patient_number: 'MRN-1',
      user: { core_profiles_user_id: [] },
    });
    expect(await repo.findPatientForReceipt(PATIENT)).toEqual({
      patient_number: 'MRN-1',
      profile: null,
    });
  });
});
