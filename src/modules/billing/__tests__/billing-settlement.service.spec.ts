/**
 * BillingSettlementService — fee schedule, pricing, settle, collect with mocks.
 */

import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { BillingSettlementService } from '../billing-settlement.service';

function money(n: string | number) {
  return { toString: () => String(n) };
}

describe('BillingSettlementService', () => {
  const billingRepo = {
    isConnected: jest.fn().mockReturnValue(true),
    findActiveServicePrices: jest.fn().mockResolvedValue([
      { service_code: 'CONSULT', standard_price: '2500' },
      { service_code: 'LAB', standard_price: '1500' },
      { service_code: 'MED', standard_price: '800' },
    ]),
  };
  const finance = {
    resolveConsultFeeService: jest.fn().mockResolvedValue({
      id: 'svc1',
      serviceCode: 'CONSULT',
      serviceName: 'Outpatient Consultation',
      standardPrice: '2500',
      category: 'Consultation',
    }),
    quoteVisitLines: jest.fn().mockResolvedValue({
      lines: [
        {
          serviceId: 'svc1',
          serviceCode: 'CONSULT',
          description: 'Consultation',
          quantity: '1',
          unitPrice: '2500',
          totalPrice: '2500',
        },
      ],
      subtotal: '2500',
      discount: '0',
      tax: '0',
      totalAmount: '2500',
    }),
    createInvoice: jest.fn().mockResolvedValue({
      id: 'inv1',
      invoiceNumber: 'INV-1',
      totalAmount: '2500',
      status: 'DRAFT',
    }),
    issueInvoice: jest.fn().mockResolvedValue({
      id: 'inv1',
      invoiceNumber: 'INV-1',
      totalAmount: '2500',
      status: 'ISSUED',
    }),
    createPayment: jest.fn().mockResolvedValue({
      id: 'pay1',
      paymentNumber: 'PAY-1',
    }),
    createClaim: jest.fn().mockResolvedValue({
      id: 'cl1',
      claimNumber: 'CL-1',
    }),
    transitionClaim: jest.fn().mockResolvedValue({
      id: 'cl1',
      claimNumber: 'CL-1',
      status: 'SUBMITTED',
    }),
    getInvoice: jest.fn().mockResolvedValue({
      id: 'inv1',
      invoiceNumber: 'INV-1',
      patientId: 'pat1',
      totalAmount: '2500',
      outstanding: '2500',
      status: 'DRAFT',
    }),
    updateDraftInvoice: jest.fn().mockImplementation(async () =>
      finance.getInvoice(),
    ),
  };
  const prisma = {
    isConnected: true,
    settings: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    services: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'extra1',
          service_code: 'XRAY',
          service_name: 'Chest X-Ray',
          standard_price: money('3000'),
          is_active: true,
        },
      ]),
      findFirst: jest.fn().mockImplementation(({ where }) => {
        if (where?.service_code === 'LAB') {
          return Promise.resolve({
            id: 'lab-svc',
            service_code: 'LAB',
            standard_price: money('1500'),
          });
        }
        if (where?.service_code === 'MED') {
          return Promise.resolve({
            id: 'med-svc',
            service_code: 'MED',
            standard_price: money('800'),
          });
        }
        if (where?.service_code === 'CONSULT') {
          return Promise.resolve({ id: 'svc1', service_code: 'CONSULT' });
        }
        if (where?.id === 'extra1') {
          return Promise.resolve({
            id: 'extra1',
            service_name: 'Chest X-Ray',
            standard_price: money('3000'),
          });
        }
        return Promise.resolve(null);
      }),
    },
    testTypes: {
      findFirst: jest.fn().mockResolvedValue({
        standard_price: money('1200'),
      }),
    },
    medications: {
      findFirst: jest.fn().mockResolvedValue({
        standard_selling_price: money('450'),
      }),
    },
    patients: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'pat1',
        patient_number: 'MRN-1',
        deleted_at: null,
      }),
    },
    paymentMethods: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'pm-cash',
        method_code: 'CASH',
      }),
    },
    payments: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    taxRates: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    insuranceClaims: {
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue({
        id: 'cl1',
        claim_number: 'CL-1',
      }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    insurancePolicies: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'pol1' }),
    },
    outpatientVisits: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
  };

  let service: BillingSettlementService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.isConnected = true;
    billingRepo.isConnected.mockReturnValue(true);
    finance.getInvoice.mockResolvedValue({
      id: 'inv1',
      invoiceNumber: 'INV-1',
      patientId: 'pat1',
      totalAmount: '2500',
      outstanding: '2500',
      status: 'DRAFT',
    });
    service = new BillingSettlementService(
      billingRepo as never,
      finance as never,
      prisma as never,
    );
    jest.spyOn(service, 'ensureFeeSchedule').mockResolvedValue(undefined);
  });

  it('returns offline defaults when billing repo is disconnected', async () => {
    billingRepo.isConnected.mockReturnValueOnce(false);
    const schedule = await service.getFeeSchedule();
    expect(schedule).toEqual(
      expect.objectContaining({
        consult: 2500,
        lab: 1500,
        medication: 800,
        consultationFeeEnabled: true,
      }),
    );
  });

  it('resolves fee schedule from finance + catalog prices', async () => {
    const schedule = await service.getFeeSchedule();
    expect(finance.resolveConsultFeeService).toHaveBeenCalled();
    expect(billingRepo.findActiveServicePrices).toHaveBeenCalledWith([
      'CONSULT',
      'LAB',
      'MED',
    ]);
    expect(schedule.consult).toBe(2500);
    expect(schedule.lab).toBe(1500);
    expect(schedule.medication).toBe(800);
    expect(schedule.consultServiceCode).toBe('CONSULT');
  });

  it('falls back when consult fee service cannot be resolved', async () => {
    finance.resolveConsultFeeService.mockRejectedValueOnce(
      new Error('missing'),
    );
    const schedule = await service.getFeeSchedule();
    expect(schedule.consult).toBe(2500);
  });

  it('honors consultation_fee_enabled setting', async () => {
    prisma.settings.findUnique.mockResolvedValueOnce({
      key: 'consultation_fee_enabled',
      value: 'off',
    });
    const schedule = await service.getFeeSchedule();
    expect(schedule.consultationFeeEnabled).toBe(false);
  });

  it('quotes visits and merges extra clinical services', async () => {
    const quote = await service.quoteVisit({
      consultCount: 1,
      labCount: 0,
      medCount: 0,
      extraServiceIds: ['extra1'],
    });
    expect(finance.quoteVisitLines).toHaveBeenCalledWith(
      expect.objectContaining({ consultCount: 1 }),
    );
    expect(quote.lines.some((l) => l.serviceCode === 'XRAY')).toBe(true);
    expect(Number(quote.totalAmount)).toBeGreaterThan(2500);
  });

  it('quotes extras-only visits without calling quoteVisitLines', async () => {
    const quote = await service.quoteVisit({
      extraServiceIds: ['extra1'],
    });
    expect(finance.quoteVisitLines).not.toHaveBeenCalled();
    expect(quote.lines).toHaveLength(1);
    expect(quote.totalAmount).toBe('3000.00');
  });

  describe('priceVisitBillLines', () => {
    it('prices consult, lab, medication, and extras from catalog', async () => {
      const lines = await service.priceVisitBillLines({
        includeConsult: true,
        labTests: [{ name: 'CBC' }, { name: '  ' }],
        medications: [
          { medication: 'Amox', medicationId: 'med1' },
          { medication: 'Paracetamol' },
        ],
        orderedExtras: [{ id: 'extra1', name: 'XRay' }],
      });
      expect(lines.find((l) => l.description === 'Consultation')?.amount).toBe(
        2500,
      );
      expect(lines.find((l) => l.description === 'Lab: CBC')?.amount).toBe(1200);
      expect(
        lines.find((l) => l.description === 'Medication: Amox')?.amount,
      ).toBe(450);
      expect(lines.find((l) => l.serviceId === 'extra1')?.amount).toBe(3000);
    });

    it('falls back to fee schedule when catalog lookups miss', async () => {
      finance.resolveConsultFeeService.mockRejectedValueOnce(
        new Error('missing'),
      );
      prisma.testTypes.findFirst.mockResolvedValueOnce(null);
      prisma.medications.findFirst.mockResolvedValue(null);
      const lines = await service.priceVisitBillLines({
        includeConsult: true,
        labTests: [{ name: 'Rare' }],
        medications: [{ medication: 'Unknown' }],
      });
      expect(lines.find((l) => l.description === 'Consultation')?.amount).toBe(
        2500,
      );
      expect(lines.find((l) => l.description.startsWith('Lab:'))?.amount).toBe(
        1500,
      );
      expect(
        lines.find((l) => l.description.startsWith('Medication:'))?.amount,
      ).toBe(800);
    });
  });

  describe('settleVisit', () => {
    it('rejects when billing repo is offline', async () => {
      billingRepo.isConnected.mockReturnValueOnce(false);
      await expect(
        service.settleVisit({
          createdByUserId: 'u1',
          mrn: 'MRN-1',
          patientName: 'Ann',
          lines: [{ description: 'Consultation', amount: 2500 }],
          total: 2500,
          mode: 'CASH',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects missing patients and empty billables', async () => {
      prisma.patients.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.settleVisit({
          createdByUserId: 'u1',
          mrn: 'MISSING',
          patientName: 'X',
          lines: [{ description: 'Consultation', amount: 1 }],
          total: 1,
          mode: 'CASH',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      prisma.patients.findUnique.mockResolvedValueOnce({
        id: 'pat1',
        deleted_at: null,
      });
      await expect(
        service.settleVisit({
          createdByUserId: 'u1',
          mrn: 'MRN-1',
          patientName: 'Ann',
          lines: [],
          total: 0,
          mode: 'CASH',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('settles cash visits from catalog-priced lines', async () => {
      const result = await service.settleVisit({
        createdByUserId: 'u1',
        mrn: 'MRN-1',
        patientName: 'Ann Bee',
        diagnosis: 'URI',
        lines: [
          { description: 'Consultation', amount: 2500 },
          { description: 'Lab: CBC', amount: 1200 },
        ],
        total: 3700,
        mode: 'CASH',
        extraServiceIds: ['extra1'],
      });
      expect(finance.createInvoice).toHaveBeenCalled();
      expect(finance.issueInvoice).toHaveBeenCalledWith('inv1', 'u1');
      expect(finance.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          allocateToInvoiceId: 'inv1',
          paymentMethodId: 'pm-cash',
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          invoiceId: 'inv1',
          paymentId: 'pay1',
          totalAmount: '2500',
        }),
      );
    });

    it('returns existing payment when transaction reference is a duplicate', async () => {
      prisma.payments.findFirst.mockResolvedValueOnce({ id: 'pay-dup' });
      const result = await service.settleVisit({
        createdByUserId: 'u1',
        mrn: 'MRN-1',
        patientName: 'Ann',
        lines: [{ description: 'Consultation', amount: 2500 }],
        total: 2500,
        mode: 'MPESA',
        transactionReference: 'RX123',
      });
      expect(finance.createPayment).not.toHaveBeenCalled();
      expect(result.paymentId).toBe('pay-dup');
    });

    it('settles insurance visits with claim submission', async () => {
      const result = await service.settleVisit({
        createdByUserId: 'u1',
        mrn: 'MRN-1',
        patientName: 'Ann',
        lines: [{ description: 'Consultation', amount: 2500 }],
        total: 2500,
        mode: 'CLAIM',
        claimExternalId: 'EXT-9',
        providerId: 'prov1',
        policyNumber: 'POL-1',
      });
      expect(finance.createClaim).toHaveBeenCalled();
      expect(prisma.insuranceClaims.update).toHaveBeenCalled();
      expect(prisma.insurancePolicies.create).toHaveBeenCalled();
      expect(finance.transitionClaim).toHaveBeenCalledWith(
        'cl1',
        expect.objectContaining({ status: 'SUBMITTED' }),
      );
      expect(result.claimNumber).toBe('CL-1');
      expect(result.claimDbId).toBe('cl1');
    });

    it('uses quoteVisitLines when line amounts are not catalog-priced', async () => {
      await service.settleVisit({
        createdByUserId: 'u1',
        mrn: 'MRN-1',
        patientName: 'Ann',
        lines: [{ description: 'Consultation', amount: Number.NaN }],
        total: 2500,
        mode: 'CASH',
      });
      expect(finance.quoteVisitLines).toHaveBeenCalledWith(
        expect.objectContaining({ consultCount: 1 }),
      );
    });
  });

  describe('syncClaimStatus', () => {
    it('no-ops when disconnected or claim missing', async () => {
      prisma.isConnected = false;
      await service.syncClaimStatus('CL-1', 'ACCEPTED');
      expect(finance.transitionClaim).not.toHaveBeenCalled();

      prisma.isConnected = true;
      prisma.insuranceClaims.findFirst.mockResolvedValueOnce(null);
      await service.syncClaimStatus('CL-missing', 'ACCEPTED');
      expect(finance.transitionClaim).not.toHaveBeenCalled();
    });

    it('transitions draft → submitted, rejected → denied, accepted → approved', async () => {
      prisma.insuranceClaims.findFirst.mockResolvedValue({
        id: 'cl1',
        status: 'DRAFT',
        created_by: 'u1',
        amount_claimed: money('2500'),
      });
      await service.syncClaimStatus('CL-1', 'SUBMITTED');
      expect(finance.transitionClaim).toHaveBeenCalledWith(
        'cl1',
        expect.objectContaining({ status: 'SUBMITTED' }),
      );

      await service.syncClaimStatus('CL-1', 'REJECTED');
      expect(finance.transitionClaim).toHaveBeenCalledWith(
        'cl1',
        expect.objectContaining({ status: 'DENIED' }),
      );

      await service.syncClaimStatus('CL-1', 'ACCEPTED');
      expect(finance.transitionClaim).toHaveBeenCalledWith(
        'cl1',
        expect.objectContaining({
          status: 'APPROVED',
          amountApproved: '2500',
        }),
      );
    });
  });

  describe('createConsultFeeDraft + collectOnInvoice', () => {
    it('creates a draft consult fee invoice', async () => {
      const draft = await service.createConsultFeeDraft({
        mrn: 'MRN-1',
        patientName: 'Ann',
        actorUserId: 'u1',
        visitId: 'v1',
      });
      expect(finance.quoteVisitLines).toHaveBeenCalledWith({ consultCount: 1 });
      expect(finance.createInvoice).toHaveBeenCalled();
      expect(draft).toEqual({
        invoiceId: 'inv1',
        invoiceNumber: 'INV-1',
        totalAmount: '2500',
      });
    });

    it('rejects consult draft when patient or quote is missing', async () => {
      billingRepo.isConnected.mockReturnValueOnce(false);
      await expect(
        service.createConsultFeeDraft({
          mrn: 'MRN-1',
          patientName: 'Ann',
          actorUserId: 'u1',
          visitId: 'v1',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      billingRepo.isConnected.mockReturnValue(true);
      finance.quoteVisitLines.mockResolvedValueOnce({
        lines: [],
        subtotal: '0',
        discount: '0',
        tax: '0',
        totalAmount: '0',
      });
      await expect(
        service.createConsultFeeDraft({
          mrn: 'MRN-1',
          patientName: 'Ann',
          actorUserId: 'u1',
          visitId: 'v1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('issues draft invoices and collects cash payments', async () => {
      finance.getInvoice
        .mockResolvedValueOnce({
          id: 'inv1',
          invoiceNumber: 'INV-1',
          patientId: 'pat1',
          totalAmount: '2500',
          outstanding: '2500',
          status: 'DRAFT',
        })
        .mockResolvedValue({
          id: 'inv1',
          invoiceNumber: 'INV-1',
          patientId: 'pat1',
          totalAmount: '2500',
          outstanding: '0.00',
          status: 'PAID',
        });
      finance.issueInvoice.mockResolvedValue({
        id: 'inv1',
        invoiceNumber: 'INV-1',
        patientId: 'pat1',
        totalAmount: '2500',
        outstanding: '2500',
        status: 'ISSUED',
      });

      prisma.outpatientVisits.findMany.mockResolvedValueOnce([
        {
          id: 'v1',
          stage: 'AWAITING_PAYMENT',
          payload: {
            billing: {
              invoiceId: 'inv1',
              consultFeeStatus: 'PENDING',
              consultFeeAmount: 2500,
            },
          },
        },
      ]);

      const collected = await service.collectOnInvoice({
        invoiceId: 'inv1',
        mode: 'CASH',
        actorUserId: 'u1',
      });
      expect(finance.issueInvoice).toHaveBeenCalled();
      expect(finance.createPayment).toHaveBeenCalled();
      expect(prisma.outpatientVisits.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'v1' },
          data: expect.objectContaining({ stage: 'CHECKED_IN' }),
        }),
      );
      expect(collected.status).toBe('PAID');
      expect(collected.paymentId).toBe('pay1');
    });

    it('short-circuits when invoice is already paid', async () => {
      finance.getInvoice.mockResolvedValueOnce({
        id: 'inv1',
        invoiceNumber: 'INV-1',
        patientId: 'pat1',
        totalAmount: '2500',
        outstanding: '0',
        status: 'PAID',
      });
      const paid = await service.collectOnInvoice({
        invoiceId: 'inv1',
        mode: 'CASH',
        actorUserId: 'u1',
      });
      expect(finance.createPayment).not.toHaveBeenCalled();
      expect(paid.paymentId).toBe('');
      expect(paid.status).toBe('PAID');
    });

    it('rejects overpayment and missing payment methods', async () => {
      finance.getInvoice.mockResolvedValue({
        id: 'inv1',
        invoiceNumber: 'INV-1',
        patientId: 'pat1',
        totalAmount: '2500',
        outstanding: '100',
        status: 'ISSUED',
      });
      await expect(
        service.collectOnInvoice({
          invoiceId: 'inv1',
          mode: 'CASH',
          amount: 500,
          actorUserId: 'u1',
        }),
      ).rejects.toThrow(/exceeds outstanding/);

      prisma.paymentMethods.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.collectOnInvoice({
          invoiceId: 'inv1',
          mode: 'MPESA',
          actorUserId: 'u1',
        }),
      ).rejects.toThrow(/not configured/);
    });
  });
});
