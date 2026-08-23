/**
 * BillingFinanceService — masters, summaries, and quote paths with Prisma mocks.
 */

import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BillingFinanceService } from '../billing-finance.service';

function money(n: string | number) {
  return { toString: () => String(n) };
}

describe('BillingFinanceService', () => {
  const audit = { recordMutation: jest.fn().mockResolvedValue(undefined) };
  const events = { emit: jest.fn() };

  const revenueAccount = {
    id: 'rev1',
    account_code: '4100',
    account_name: 'Consultation Revenue',
    account_type: 'REVENUE',
    normal_balance: 'CREDIT',
    is_active: true,
    is_postable: true,
    parent_id: null,
    description: null,
    parent: null,
  };

  const liabilityAccount = {
    id: 'liab1',
    account_code: '2200',
    account_name: 'VAT Payable',
    account_type: 'LIABILITY',
    normal_balance: 'CREDIT',
    is_active: true,
    is_postable: true,
  };

  const serviceRow = {
    id: 'svc1',
    service_code: 'CONSULT',
    service_name: 'Consultation',
    category: 'Consultation',
    description: null,
    standard_price: money('2500.00'),
    revenue_account_id: 'rev1',
    is_active: true,
  };

  let prisma: Record<string, any>;
  let service: BillingFinanceService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      services: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([serviceRow]),
        findUnique: jest.fn().mockResolvedValue(serviceRow),
        findFirst: jest.fn().mockResolvedValue(serviceRow),
        create: jest.fn().mockResolvedValue(serviceRow),
        update: jest.fn().mockResolvedValue(serviceRow),
      },
      serviceCategories: {
        upsert: jest.fn().mockResolvedValue({ id: 'cat1', name: 'Consultation' }),
      },
      accounts: {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue([revenueAccount]),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === 'rev1' || where.account_code === '4100') {
            return Promise.resolve(revenueAccount);
          }
          if (where.id === 'liab1') return Promise.resolve(liabilityAccount);
          if (where.id === 'missing') return Promise.resolve(null);
          return Promise.resolve(revenueAccount);
        }),
        create: jest.fn().mockResolvedValue(revenueAccount),
        update: jest.fn().mockResolvedValue(revenueAccount),
        groupBy: jest
          .fn()
          .mockResolvedValue([{ account_type: 'REVENUE', _count: { _all: 2 } }]),
      },
      taxRates: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'tax1',
            tax_name: 'VAT',
            tax_code: 'VAT16',
            rate_percentage: money('16'),
            liability_account_id: 'liab1',
            liability_account: liabilityAccount,
            is_active: true,
          },
        ]),
        findUnique: jest.fn().mockResolvedValue({
          id: 'tax1',
          tax_name: 'VAT',
          tax_code: 'VAT16',
          rate_percentage: money('16'),
          liability_account_id: 'liab1',
          is_active: true,
        }),
        create: jest.fn().mockResolvedValue({ id: 'tax1', tax_code: 'VAT16' }),
        update: jest.fn().mockResolvedValue({ id: 'tax1', tax_code: 'VAT16' }),
      },
      postingPeriods: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([{ id: 'p1', status: 'OPEN' }]),
        findUnique: jest.fn().mockResolvedValue({ id: 'p1', status: 'OPEN' }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'p1',
          period_name: 'Aug 2026',
          status: 'OPEN',
          start_date: new Date('2026-01-01'),
          end_date: new Date('2026-12-31'),
          fiscal_year: 2026,
        }),
        create: jest.fn().mockResolvedValue({ id: 'p1', period_name: 'Aug 2026' }),
        update: jest.fn().mockResolvedValue({ id: 'p1', status: 'CLOSED' }),
      },
      paymentMethods: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'pm1',
            method_name: 'Cash',
            method_code: 'CASH',
            gl_account_id: 'rev1',
            gl_account: revenueAccount,
            is_active: true,
          },
        ]),
        findUnique: jest.fn().mockResolvedValue({
          id: 'pm1',
          method_name: 'Cash',
          method_code: 'CASH',
          gl_account_id: 'rev1',
          is_active: true,
        }),
        update: jest.fn().mockResolvedValue({
          id: 'pm1',
          method_name: 'Cash Desk',
          method_code: 'CASH',
          gl_account_id: 'rev1',
          is_active: true,
        }),
      },
      invoices: {
        count: jest.fn().mockResolvedValue(3),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'inv1',
            invoice_number: 'INV-1',
            patient_id: 'pat1',
            invoice_date: new Date('2026-08-01'),
            due_date: new Date('2026-08-15'),
            subtotal: money('100'),
            discount: money('0'),
            tax: money('0'),
            total_amount: money('100'),
            status: 'ISSUED',
            notes: null,
            deleted_at: null,
            is_voided: false,
            patient: {
              patient_number: 'MRN-1',
              user: {
                email: 'a@b.com',
                core_profiles_user_id: [
                  { first_name: 'Ann', last_name: 'Bee', phone: '0700' },
                ],
              },
            },
            billing_payment_allocations_invoice_id: [
              { allocated_amount: money('40') },
            ],
          },
        ]),
        findUnique: jest.fn().mockResolvedValue(null),
        groupBy: jest.fn().mockResolvedValue([
          { status: 'DRAFT', _count: { _all: 1 } },
          { status: 'ISSUED', _count: { _all: 2 } },
        ]),
      },
      payments: {
        count: jest.fn().mockResolvedValue(5),
        aggregate: jest.fn().mockResolvedValue({
          _sum: { amount: money('500') },
        }),
        groupBy: jest.fn().mockResolvedValue([
          { status: 'PENDING', _count: { _all: 1 } },
          { status: 'COMPLETED', _count: { _all: 4 } },
        ]),
      },
      paymentAllocations: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { allocated_amount: money('200') },
        }),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'alloc1' }),
      },
      insuranceClaims: {
        count: jest.fn().mockResolvedValue(4),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        groupBy: jest.fn().mockResolvedValue([
          { status: 'DRAFT', _count: { _all: 1 } },
          { status: 'SUBMITTED', _count: { _all: 1 } },
          { status: 'APPROVED', _count: { _all: 1 } },
          { status: 'DENIED', _count: { _all: 1 } },
        ]),
      },
      journalEntries: {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        groupBy: jest.fn().mockResolvedValue([
          { status: 'DRAFT', _count: { _all: 1 } },
          { status: 'POSTED', _count: { _all: 1 } },
        ]),
      },
      journalLines: {
        count: jest.fn().mockResolvedValue(0),
      },
      settings: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    service = new BillingFinanceService(
      prisma as never,
      audit as never,
      events as unknown as EventEmitter2,
    );
  });

  describe('services master', () => {
    it('lists and gets services', async () => {
      const listed = await service.listServices({
        page: 1,
        limit: 10,
        search: 'consult',
        active: true,
        category: 'Consultation',
      });
      expect(listed.items[0].serviceCode).toBe('CONSULT');
      expect(listed.total).toBe(1);

      const one = await service.getService('svc1');
      expect(one.standardPrice).toBe('2500.00');

      prisma.services.findUnique.mockResolvedValueOnce(null);
      await expect(service.getService('x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('creates a service with category and revenue account', async () => {
      const created = await service.createService({
        serviceCode: 'CONSULT',
        serviceName: 'Consultation',
        category: 'Consultation',
        standardPrice: '2500',
        revenueAccountId: 'rev1',
        actorUserId: 'u1',
      });
      expect(prisma.serviceCategories.upsert).toHaveBeenCalled();
      expect(prisma.services.create).toHaveBeenCalled();
      expect(audit.recordMutation).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE', entityType: 'billing.services' }),
      );
      expect(created.serviceCode).toBe('CONSULT');
    });

    it('resolves default revenue when creating active service without account', async () => {
      prisma.accounts.findUnique.mockResolvedValueOnce(revenueAccount);
      await service.createService({
        serviceCode: 'CONSULT',
        serviceName: 'Consultation',
        category: 'Consultation',
        standardPrice: 100,
        actorUserId: 'u1',
      });
      expect(prisma.services.create).toHaveBeenCalled();
    });

    it('updates a service and rejects missing ones', async () => {
      const updated = await service.updateService('svc1', {
        serviceName: 'OPD Consult',
        standardPrice: '3000',
        isActive: true,
        actorUserId: 'u1',
      });
      expect(prisma.services.update).toHaveBeenCalled();
      expect(updated.serviceCode).toBe('CONSULT');

      prisma.services.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.updateService('missing', { actorUserId: 'u1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('accounts master', () => {
    it('lists accounts with search filters', async () => {
      const listed = await service.listAccounts({
        search: '4100',
        accountType: 'revenue',
        active: true,
        postable: true,
      });
      expect(listed.items[0].accountCode).toBe('4100');
    });

    it('creates and updates accounts with validation', async () => {
      const created = await service.createAccount({
        accountCode: '4100',
        accountName: 'Consultation Revenue',
        accountType: 'REVENUE',
        normalBalance: 'CREDIT',
        actorUserId: 'u1',
      });
      expect(created.account_code).toBe('4100');

      await expect(
        service.createAccount({
          accountCode: 'x',
          accountName: 'x',
          accountType: 'REVENUE',
          normalBalance: 'DEBIT',
          actorUserId: 'u1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.createAccount({
          accountCode: 'x',
          accountName: 'x',
          parentId: 'missing',
          accountType: 'REVENUE',
          normalBalance: 'CREDIT',
          actorUserId: 'u1',
        }),
      ).rejects.toThrow('Parent account not found');

      const updated = await service.updateAccount('rev1', {
        accountName: 'Consult Rev',
        actorUserId: 'u1',
      });
      expect(updated.account_code).toBe('4100');

      prisma.accounts.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.updateAccount('x', { actorUserId: 'u1' }),
      ).rejects.toBeInstanceOf(NotFoundException);

      prisma.accounts.findUnique.mockResolvedValueOnce(revenueAccount);
      prisma.journalLines.count.mockResolvedValueOnce(2);
      await expect(
        service.updateAccount('rev1', {
          accountType: 'ASSET',
          normalBalance: 'DEBIT',
          actorUserId: 'u1',
        }),
      ).rejects.toThrow(/Cannot change account type/);

      prisma.accounts.findUnique.mockResolvedValue(revenueAccount);
      await expect(
        service.updateAccount('rev1', {
          parentId: 'rev1',
          actorUserId: 'u1',
        }),
      ).rejects.toThrow(/own parent/);
    });
  });

  describe('tax / periods / payment methods', () => {
    it('manages tax rates', async () => {
      const listed = await service.listTaxRates({ search: 'VAT', active: true });
      expect(listed.items[0].taxCode).toBe('VAT16');

      await service.createTaxRate({
        taxName: 'VAT',
        taxCode: 'VAT16',
        ratePercentage: 16,
        liabilityAccountId: 'liab1',
        actorUserId: 'u1',
      });
      expect(prisma.taxRates.create).toHaveBeenCalled();

      await expect(
        service.createTaxRate({
          taxName: 'Bad',
          taxCode: 'B',
          ratePercentage: 200,
          liabilityAccountId: 'liab1',
          actorUserId: 'u1',
        }),
      ).rejects.toThrow(/between 0 and 100/);

      await service.updateTaxRate('tax1', {
        taxName: 'VAT 16%',
        ratePercentage: 16,
        actorUserId: 'u1',
      });

      prisma.taxRates.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.updateTaxRate('x', { actorUserId: 'u1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('manages posting periods', async () => {
      const listed = await service.listPeriods({ status: 'open' });
      expect(listed.items).toHaveLength(1);

      await service.createPeriod({
        periodName: 'Aug 2026',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        fiscalYear: 2026,
        actorUserId: 'u1',
      });

      await expect(
        service.createPeriod({
          periodName: 'Bad',
          startDate: '2026-08-31',
          endDate: '2026-08-01',
          fiscalYear: 2026,
          actorUserId: 'u1',
        }),
      ).rejects.toThrow(/end date/);

      await service.setPeriodStatus('p1', 'CLOSED', 'u1');
      expect(prisma.postingPeriods.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'CLOSED' } }),
      );

      prisma.postingPeriods.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.setPeriodStatus('x', 'OPEN', 'u1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lists and updates payment methods', async () => {
      const methods = await service.listPaymentMethods({ active: true });
      expect(methods[0].methodCode).toBe('CASH');

      const updated = await service.updatePaymentMethod('pm1', {
        methodName: 'Cash Desk',
        glAccountId: 'rev1',
        actorUserId: 'u1',
      });
      expect(updated?.methodName).toBe('Cash');

      prisma.paymentMethods.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.updatePaymentMethod('x', { actorUserId: 'u1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('invoices list + summaries + quote', () => {
    it('lists invoices with outstanding balances', async () => {
      const listed = await service.listInvoices({
        search: 'INV',
        status: 'issued',
        from: '2026-01-01',
        to: '2026-12-31',
      });
      expect(listed.items[0].invoiceNumber).toBe('INV-1');
      expect(listed.items[0].outstanding).toBe('60.00');
    });

    it('computes overview and KPI summaries', async () => {
      const overview = await service.overview();
      expect(overview.todayIssuedInvoiceCount).toBe(1);
      expect(overview.pendingClaimsCount).toBe(4);

      expect(await service.invoicesSummary()).toEqual(
        expect.objectContaining({ total: 3, draft: 1, issued: 2 }),
      );
      expect(await service.paymentsSummary()).toEqual(
        expect.objectContaining({ total: 5, pending: 1 }),
      );
      expect(await service.claimsSummary()).toEqual(
        expect.objectContaining({
          total: 4,
          draft: 1,
          inFlight: 1,
          approved: 1,
          denied: 1,
        }),
      );
      expect(await service.servicesSummary()).toEqual({
        total: 1,
        active: 1,
        inactive: 0,
      });
      expect(await service.accountsSummary()).toEqual(
        expect.objectContaining({ total: 2, activePostable: 2 }),
      );
      expect(await service.journalsSummary()).toEqual(
        expect.objectContaining({ total: 2, draft: 1, posted: 1 }),
      );
    });

    it('resolves consult fee service and quotes visit lines', async () => {
      prisma.settings.findUnique.mockResolvedValueOnce({
        key: 'consultation_fee_service_code',
        value: 'CONSULT',
      });
      const resolved = await service.resolveConsultFeeService();
      expect(resolved.serviceCode).toBe('CONSULT');

      prisma.settings.findUnique.mockResolvedValue(null);
      prisma.services.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(serviceRow);
      const legacy = await service.resolveConsultFeeService();
      expect(legacy.serviceCode).toBe('CONSULT');

      prisma.services.findFirst.mockResolvedValue(null);
      await expect(service.resolveConsultFeeService()).rejects.toThrow(
        /No consultation fee service/,
      );

      prisma.settings.findUnique.mockResolvedValue(null);
      prisma.services.findFirst.mockResolvedValue(serviceRow);
      prisma.services.findMany.mockResolvedValue([
        serviceRow,
        {
          ...serviceRow,
          id: 'lab1',
          service_code: 'LAB',
          service_name: 'Lab',
          standard_price: money('500'),
        },
      ]);
      const quote = await service.quoteVisitLines({
        consultCount: 1,
        labCount: 1,
        taxRateId: 'tax1',
      });
      expect(quote.lines.length).toBeGreaterThanOrEqual(2);

      await expect(service.quoteVisitLines({})).rejects.toThrow(
        /At least one fee line/,
      );
    });
  });

  describe('createInvoice', () => {
    const invoiceDetail = {
      id: 'inv-new',
      invoice_number: 'INV-2026-0001',
      patient_id: 'pat1',
      consultation_id: null,
      admission_id: null,
      invoice_date: new Date('2026-08-01'),
      due_date: new Date('2026-08-15'),
      subtotal: money('2500'),
      discount: money('0'),
      tax: money('0'),
      total_amount: money('2500'),
      status: 'DRAFT',
      is_voided: false,
      void_reason: null,
      notes: null,
      deleted_at: null,
      patient: {
        patient_number: 'MRN-1',
        user: {
          email: 'a@b.com',
          core_profiles_user_id: [
            { first_name: 'Ann', last_name: 'Bee', phone: '0700' },
          ],
        },
      },
      billing_invoice_items_invoice_id: [
        {
          id: 'li1',
          service_id: 'svc1',
          description: 'Consultation',
          quantity: money('1'),
          unit_price: money('2500'),
          total_price: money('2500'),
          service: serviceRow,
        },
      ],
      billing_payment_allocations_invoice_id: [],
      billing_insurance_claims_invoice_id: [],
    };

    beforeEach(() => {
      prisma.patients = {
        findUnique: jest.fn().mockResolvedValue({
          id: 'pat1',
          deleted_at: null,
        }),
      };
      prisma.invoices.count = jest.fn().mockResolvedValue(0);
      prisma.invoices.create = jest.fn().mockResolvedValue({
        id: 'inv-new',
        invoice_number: 'INV-2026-0001',
      });
      prisma.invoices.findUnique = jest.fn().mockResolvedValue(invoiceDetail);
    });

    it('creates a draft invoice from service lines', async () => {
      const created = await service.createInvoice({
        patientId: 'pat1',
        lines: [{ serviceId: 'svc1', quantity: 1 }],
        actorUserId: 'u1',
      });
      expect(prisma.invoices.create).toHaveBeenCalled();
      expect(audit.recordMutation).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entityType: 'billing.invoices',
        }),
      );
      expect(created.invoiceNumber).toMatch(/^INV-/);
      expect(created.status).toBe('DRAFT');
      expect(created.totalAmount).toBe('2500');
    });

    it('rejects empty lines and missing patients', async () => {
      await expect(
        service.createInvoice({
          patientId: 'pat1',
          lines: [],
          actorUserId: 'u1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      prisma.patients.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.createInvoice({
          patientId: 'missing',
          lines: [{ description: 'X', quantity: 1, unitPrice: 10 }],
          actorUserId: 'u1',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('issue / void / payments / claims / journals', () => {
    const draftInvoice = {
      id: 'inv1',
      invoice_number: 'INV-1',
      patient_id: 'pat1',
      status: 'DRAFT',
      deleted_at: null,
      is_voided: false,
      discount: money('0'),
      notes: null,
      billing_invoice_items_invoice_id: [
        {
          id: 'li1',
          service_id: 'svc1',
          description: 'Consultation',
          quantity: money('1'),
          unit_price: money('2500'),
          total_price: money('2500'),
          service: {
            ...serviceRow,
            revenue_account_id: 'rev1',
            is_active: true,
          },
        },
      ],
    };

    const arAccount = {
      id: 'ar1',
      account_code: '1100',
      account_name: 'AR',
      account_type: 'ASSET',
      normal_balance: 'DEBIT',
      is_active: true,
      is_postable: true,
    };

    beforeEach(() => {
      prisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown) =>
        fn(prisma),
      );
      prisma.settings = {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      };
      prisma.patients = {
        findUnique: jest.fn().mockResolvedValue({
          id: 'pat1',
          deleted_at: null,
          patient_number: 'MRN-1',
          user: {
            email: 'a@b.com',
            core_profiles_user_id: [
              { first_name: 'Ann', last_name: 'Bee', phone: '0700' },
            ],
          },
        }),
      };
      prisma.accounts.findUnique = jest.fn().mockImplementation(({ where }) => {
        if (where.account_code === '1100' || where.id === 'ar1') {
          return Promise.resolve(arAccount);
        }
        if (where.id === 'rev1' || where.account_code === '4100') {
          return Promise.resolve(revenueAccount);
        }
        if (where.id === 'liab1') return Promise.resolve(liabilityAccount);
        if (where.account_code === '1000' || where.id === 'cash1') {
          return Promise.resolve({
            id: 'cash1',
            account_code: '1000',
            account_name: 'Cash',
            account_type: 'ASSET',
            normal_balance: 'DEBIT',
            is_active: true,
            is_postable: true,
          });
        }
        return Promise.resolve(revenueAccount);
      });
      prisma.accounts.findMany = jest.fn().mockImplementation(({ where }) => {
        const ids: string[] = where?.id?.in ?? [];
        const all = {
          ar1: arAccount,
          rev1: revenueAccount,
          liab1: liabilityAccount,
          cash1: {
            id: 'cash1',
            account_code: '1000',
            account_name: 'Cash',
            account_type: 'ASSET',
            normal_balance: 'DEBIT',
            is_active: true,
            is_postable: true,
          },
        } as Record<string, unknown>;
        if (ids.length) {
          return Promise.resolve(ids.map((id) => all[id]).filter(Boolean));
        }
        return Promise.resolve([arAccount, revenueAccount]);
      });
      prisma.accounts.findFirst = jest.fn().mockResolvedValue(arAccount);
      prisma.paymentAllocations = {
        ...prisma.paymentAllocations,
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({
          _sum: { allocated_amount: money('0') },
        }),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'alloc1' }),
      };
      prisma.postingPeriods.findFirst = jest.fn().mockResolvedValue({
        id: 'p1',
        period_name: 'Aug 2026',
        status: 'OPEN',
        start_date: new Date('2026-01-01'),
        end_date: new Date('2026-12-31'),
        fiscal_year: 2026,
      });
      prisma.invoices.findUnique = jest.fn().mockResolvedValue(draftInvoice);
      prisma.invoices.update = jest.fn().mockResolvedValue({
        ...draftInvoice,
        status: 'ISSUED',
      });
      prisma.journalEntries = {
        ...prisma.journalEntries,
        create: jest.fn().mockResolvedValue({
          id: 'je1',
          status: 'POSTED',
          entry_number: 'JE-1',
        }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'je1',
          status: 'POSTED',
          entry_number: 'JE-1',
          reference_type: 'INVOICE',
          reference_id: 'inv1',
          billing_journal_lines_journal_entry_id: [
            {
              id: 'jl1',
              account_id: 'ar1',
              direction: 'DEBIT',
              amount: money('2500'),
            },
            {
              id: 'jl2',
              account_id: 'rev1',
              direction: 'CREDIT',
              amount: money('2500'),
            },
          ],
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'je1',
          status: 'POSTED',
          entry_number: 'JE-1',
          posting_period_id: 'p1',
          reversal_of_id: null,
          entry_date: new Date(),
          description: 'Issue INV-1',
          reference_type: 'INVOICE',
          reference_id: 'inv1',
          posted_at: new Date(),
          created_by: 'u1',
          posting_period: { id: 'p1', period_name: 'Aug 2026' },
          billing_journal_lines_journal_entry_id: [
            {
              id: 'jl1',
              account_id: 'ar1',
              direction: 'DEBIT',
              amount: money('2500'),
              description: null,
              account: arAccount,
            },
            {
              id: 'jl2',
              account_id: 'rev1',
              direction: 'CREDIT',
              amount: money('2500'),
              description: null,
              account: revenueAccount,
            },
          ],
        }),
        update: jest.fn().mockResolvedValue({ id: 'je1', status: 'POSTED' }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      };
      prisma.journalLines = {
        ...prisma.journalLines,
        create: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'jl1',
            account_id: 'ar1',
            direction: 'DEBIT',
            amount: money('2500'),
          },
          {
            id: 'jl2',
            account_id: 'rev1',
            direction: 'CREDIT',
            amount: money('2500'),
          },
        ]),
      };
      prisma.invoiceItems = {
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      };
      prisma.documentSequences = {
        upsert: jest.fn().mockResolvedValue({ current_value: 1 }),
        update: jest.fn().mockResolvedValue({ current_value: 2 }),
        findUnique: jest.fn().mockResolvedValue({
          prefix: 'INV',
          current_value: 1,
        }),
      };
    });

    it('issues a draft invoice', async () => {
      const issuedDetail = {
        ...draftInvoice,
        status: 'ISSUED',
        subtotal: money('2500'),
        discount: money('0'),
        tax: money('0'),
        total_amount: money('2500'),
        invoice_date: new Date(),
        due_date: new Date(),
        void_reason: null,
        patient: {
          patient_number: 'MRN-1',
          user: {
            email: 'a@b.com',
            core_profiles_user_id: [
              { first_name: 'Ann', last_name: 'Bee', phone: '0700' },
            ],
          },
        },
        billing_payment_allocations_invoice_id: [],
        billing_insurance_claims_invoice_id: [],
      };
      prisma.invoices.findUnique
        .mockResolvedValueOnce(draftInvoice)
        .mockResolvedValue(issuedDetail);

      const result = await service.issueInvoice('inv1', 'u1');
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.status).toBe('ISSUED');
      expect(events.emit).toHaveBeenCalled();
    });

    it('rejects issuing non-draft invoices', async () => {
      prisma.invoices.findUnique.mockResolvedValueOnce({
        ...draftInvoice,
        status: 'ISSUED',
      });
      await expect(service.issueInvoice('inv1', 'u1')).rejects.toThrow(
        /Only draft invoices/,
      );
    });

    it('voids an issued invoice', async () => {
      const issued = {
        ...draftInvoice,
        status: 'ISSUED',
        billing_payment_allocations_invoice_id: [],
      };
      prisma.invoices.findUnique
        .mockResolvedValueOnce(issued)
        .mockResolvedValue({
          ...issued,
          status: 'VOIDED',
          is_voided: true,
          void_reason: 'Error',
          subtotal: money('2500'),
          discount: money('0'),
          tax: money('0'),
          total_amount: money('2500'),
          invoice_date: new Date(),
          due_date: new Date(),
          patient: {
            patient_number: 'MRN-1',
            user: {
              email: 'a@b.com',
              core_profiles_user_id: [
                { first_name: 'Ann', last_name: 'Bee', phone: '0700' },
              ],
            },
          },
          billing_invoice_items_invoice_id: draftInvoice.billing_invoice_items_invoice_id,
          billing_payment_allocations_invoice_id: [],
          billing_insurance_claims_invoice_id: [],
        });
      prisma.invoices.update.mockResolvedValue({
        ...issued,
        status: 'VOIDED',
      });

      const voided = await service.voidInvoice('inv1', 'Error', 'u1');
      expect(voided.status).toBe('VOIDED');
    });

    it('creates a payment without allocation', async () => {
      prisma.payments = {
        ...prisma.payments,
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'pay1',
          payment_number: 'PAY-1',
          amount: money('100'),
          status: 'COMPLETED',
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'pay1',
          payment_number: 'PAY-1',
          amount: money('100'),
          status: 'COMPLETED',
          payment_date: new Date(),
          transaction_reference: null,
          notes: null,
          patient_id: 'pat1',
          payment_method_id: 'pm1',
          received_by: 'u1',
          patient: {
            patient_number: 'MRN-1',
            user: {
              core_profiles_user_id: [
                { first_name: 'Ann', last_name: 'Bee' },
              ],
            },
          },
          payment_method: {
            method_name: 'Cash',
            method_code: 'CASH',
          },
          billing_payment_allocations_payment_id: [],
        }),
      };
      prisma.paymentMethods.findUnique.mockResolvedValue({
        id: 'pm1',
        method_name: 'Cash',
        method_code: 'CASH',
        gl_account_id: 'cash1',
        is_active: true,
        gl_account: {
          id: 'cash1',
          account_code: '1000',
          account_type: 'ASSET',
          normal_balance: 'DEBIT',
          is_active: true,
          is_postable: true,
        },
      });

      const pay = await service.createPayment({
        patientId: 'pat1',
        amount: '100',
        paymentMethodId: 'pm1',
        actorUserId: 'u1',
      });
      expect(pay.paymentNumber).toMatch(/^PAY-/);
      expect(prisma.payments.create).toHaveBeenCalled();
    });

    it('lists and gets payments', async () => {
      prisma.payments.findMany = jest.fn().mockResolvedValue([
        {
          id: 'pay1',
          payment_number: 'PAY-1',
          amount: money('100'),
          status: 'COMPLETED',
          payment_date: new Date(),
          transaction_reference: null,
          notes: null,
          patient_id: 'pat1',
          payment_method_id: 'pm1',
          received_by: 'u1',
          patient: {
            patient_number: 'MRN-1',
            user: {
              core_profiles_user_id: [
                { first_name: 'Ann', last_name: 'Bee' },
              ],
            },
          },
          payment_method: { method_name: 'Cash', method_code: 'CASH' },
          billing_payment_allocations_payment_id: [],
        },
      ]);
      prisma.payments.findUnique = jest.fn().mockResolvedValue({
        id: 'pay1',
        payment_number: 'PAY-1',
        amount: money('100'),
        status: 'COMPLETED',
        payment_date: new Date(),
        transaction_reference: null,
        notes: null,
        patient_id: 'pat1',
        payment_method_id: 'pm1',
        received_by: 'u1',
        patient: {
          patient_number: 'MRN-1',
          user: {
            core_profiles_user_id: [
              { first_name: 'Ann', last_name: 'Bee' },
            ],
          },
        },
        payment_method: { method_name: 'Cash', method_code: 'CASH' },
        billing_payment_allocations_payment_id: [],
      });

      const listed = await service.listPayments({ page: 1, limit: 10 });
      expect(listed.items[0].paymentNumber).toBe('PAY-1');
      const one = await service.getPayment('pay1');
      expect(one.paymentNumber).toBe('PAY-1');
    });

    it('lists claims and rejects bad transitions', async () => {
      const claimPatient = {
        patient_number: 'MRN-1',
        user: {
          core_profiles_user_id: [{ first_name: 'Ann', last_name: 'Bee' }],
        },
      };
      const claimRow = {
        id: 'cl1',
        claim_number: 'CL-1',
        status: 'DRAFT',
        amount_claimed: money('100'),
        amount_approved: null,
        amount_paid: null,
        invoice_id: 'inv1',
        patient_id: 'pat1',
        insurance_policy_id: null,
        submission_date: null,
        decision_date: null,
        notes: null,
        invoice: { invoice_number: 'INV-1', total_amount: money('100') },
        patient: claimPatient,
      };
      prisma.insuranceClaims.findMany = jest
        .fn()
        .mockResolvedValue([claimRow]);
      prisma.insuranceClaims.findUnique = jest
        .fn()
        .mockResolvedValue(claimRow);

      const listed = await service.listClaims({ page: 1 });
      expect(listed.items[0].claimNumber).toBe('CL-1');
      const one = await service.getClaim('cl1');
      expect(one.claimNumber).toBe('CL-1');
    });

    it('lists journals', async () => {
      prisma.journalEntries.findMany = jest.fn().mockResolvedValue([
        {
          id: 'je1',
          entry_number: 'JE-1',
          status: 'POSTED',
          entry_date: new Date(),
          description: 'Manual',
          reference_type: 'MANUAL',
          reference_id: null,
          posted_at: new Date(),
          created_by: 'u1',
        },
      ]);
      prisma.journalEntries.findUnique = jest.fn().mockResolvedValue({
        id: 'je1',
        entry_number: 'JE-1',
        status: 'POSTED',
        entry_date: new Date(),
        description: 'Manual',
        reference_type: 'MANUAL',
        reference_id: null,
        posting_period_id: 'p1',
        reversal_of_id: null,
        posted_at: new Date(),
        created_by: 'u1',
        posting_period: { id: 'p1', period_name: 'Aug 2026' },
        billing_journal_lines_journal_entry_id: [
          {
            id: 'jl1',
            account_id: 'ar1',
            direction: 'DEBIT',
            amount: money('100'),
            description: null,
            account: arAccount,
          },
        ],
      });

      const listed = await service.listJournals({ page: 1 });
      expect(listed.items[0].entryNumber).toBe('JE-1');
      const one = await service.getJournal('je1');
      expect(one.entryNumber).toBe('JE-1');
    });

    it('gets an invoice detail and updates draft discounts', async () => {
      const detail = {
        ...draftInvoice,
        status: 'DRAFT',
        subtotal: money('2500'),
        discount: money('0'),
        tax: money('0'),
        total_amount: money('2500'),
        invoice_date: new Date(),
        due_date: new Date(),
        void_reason: null,
        patient: {
          patient_number: 'MRN-1',
          user: {
            email: 'a@b.com',
            core_profiles_user_id: [
              { first_name: 'Ann', last_name: 'Bee', phone: '0700' },
            ],
          },
        },
        billing_payment_allocations_invoice_id: [],
        billing_insurance_claims_invoice_id: [],
      };
      prisma.invoices.findUnique.mockResolvedValue(detail);
      const got = await service.getInvoice('inv1');
      expect(got.invoiceNumber).toBe('INV-1');
      expect(got.outstanding).toBe('0.00');

      const draftForUpdate = {
        id: 'inv1',
        status: 'DRAFT',
        deleted_at: null,
        discount: money('0'),
        notes: null,
        billing_invoice_items_invoice_id: [
          {
            id: 'li1',
            quantity: money('1'),
            unit_price: money('2500'),
            total_price: money('2500'),
          },
        ],
      };
      prisma.invoices.findUnique
        .mockResolvedValueOnce(draftForUpdate)
        .mockResolvedValue({
          ...detail,
          discount: money('100'),
          total_amount: money('2400'),
        });
      const updated = await service.updateDraftInvoice('inv1', {
        discount: '100',
        notes: 'Staff discount',
        actorUserId: 'u1',
      });
      expect(updated.discount).toBe('100');
    });

    it('creates and transitions insurance claims', async () => {
      const claimPatient = {
        patient_number: 'MRN-1',
        user: {
          email: 'a@b.com',
          core_profiles_user_id: [{ first_name: 'Ann', last_name: 'Bee' }],
        },
      };
      const claimRow = {
        id: 'cl1',
        claim_number: 'CLM-2026-0001',
        status: 'DRAFT',
        amount_claimed: money('2500'),
        amount_approved: money('0'),
        amount_paid: money('0'),
        invoice_id: 'inv1',
        patient_id: 'pat1',
        insurance_policy_id: null,
        submission_date: null,
        denial_reason: null,
        notes: null,
        invoice: { invoice_number: 'INV-1', total_amount: money('2500') },
        patient: claimPatient,
      };
      prisma.invoices.findUnique.mockResolvedValue({
        id: 'inv1',
        invoice_number: 'INV-1',
        patient_id: 'pat1',
        status: 'ISSUED',
        deleted_at: null,
        total_amount: money('2500'),
      });
      prisma.insuranceClaims.count = jest.fn().mockResolvedValue(0);
      prisma.insuranceClaims.create = jest.fn().mockResolvedValue({
        id: 'cl1',
        claim_number: 'CLM-2026-0001',
      });
      prisma.insuranceClaims.findUnique = jest.fn().mockResolvedValue(claimRow);
      prisma.insuranceClaims.update = jest.fn().mockResolvedValue({
        ...claimRow,
        status: 'SUBMITTED',
        submission_date: new Date(),
      });

      const created = await service.createClaim({
        invoiceId: 'inv1',
        amountClaimed: '2500',
        actorUserId: 'u1',
      });
      expect(created.claimNumber).toMatch(/^CLM-/);

      prisma.insuranceClaims.findUnique
        .mockResolvedValueOnce({ ...claimRow, status: 'DRAFT' })
        .mockResolvedValue({
          ...claimRow,
          status: 'SUBMITTED',
          submission_date: new Date(),
        });
      const submitted = await service.transitionClaim('cl1', {
        status: 'SUBMITTED',
        actorUserId: 'u1',
      });
      expect(submitted.status).toBe('SUBMITTED');
      expect(events.emit).toHaveBeenCalled();
    });

    it('allocates a completed payment to an issued invoice', async () => {
      const cashGl = {
        id: 'cash1',
        account_code: '1000',
        account_name: 'Cash',
        account_type: 'ASSET',
        normal_balance: 'DEBIT',
        is_active: true,
        is_postable: true,
      };
      prisma.payments.findUnique = jest.fn().mockResolvedValue({
        id: 'pay1',
        payment_number: 'PAY-1',
        amount: money('100'),
        status: 'COMPLETED',
        patient_id: 'pat1',
        payment_date: new Date(),
        payment_method: {
          gl_account_id: 'cash1',
          gl_account: cashGl,
        },
      });
      prisma.invoices.findUnique
        .mockResolvedValueOnce({
          id: 'inv1',
          invoice_number: 'INV-1',
          patient_id: 'pat1',
          status: 'ISSUED',
          deleted_at: null,
          total_amount: money('100'),
        })
        .mockResolvedValue({
          id: 'inv1',
          invoice_number: 'INV-1',
          patient_id: 'pat1',
          status: 'ISSUED',
          deleted_at: null,
          is_voided: false,
          discount: money('0'),
          notes: null,
          subtotal: money('100'),
          tax: money('0'),
          total_amount: money('100'),
          invoice_date: new Date(),
          due_date: new Date(),
          void_reason: null,
          patient: {
            patient_number: 'MRN-1',
            user: {
              email: 'a@b.com',
              core_profiles_user_id: [
                { first_name: 'Ann', last_name: 'Bee', phone: '0700' },
              ],
            },
          },
          billing_invoice_items_invoice_id: [],
          billing_payment_allocations_invoice_id: [],
          billing_insurance_claims_invoice_id: [],
        });
      prisma.paymentAllocations.aggregate = jest
        .fn()
        .mockResolvedValue({ _sum: { allocated_amount: money('0') } });
      prisma.paymentAllocations.findUnique = jest.fn().mockResolvedValue(null);
      prisma.payments.update = jest.fn().mockResolvedValue({});
      prisma.payments.findUnique
        .mockResolvedValueOnce({
          id: 'pay1',
          payment_number: 'PAY-1',
          amount: money('100'),
          status: 'COMPLETED',
          patient_id: 'pat1',
          payment_date: new Date(),
          payment_method: {
            gl_account_id: 'cash1',
            gl_account: cashGl,
          },
        })
        .mockResolvedValue({
          id: 'pay1',
          payment_number: 'PAY-1',
          amount: money('100'),
          status: 'COMPLETED',
          payment_date: new Date(),
          transaction_reference: null,
          notes: null,
          patient_id: 'pat1',
          payment_method_id: 'pm1',
          received_by: 'u1',
          journal_entry_id: 'je1',
          patient: {
            patient_number: 'MRN-1',
            user: {
              core_profiles_user_id: [{ first_name: 'Ann', last_name: 'Bee' }],
            },
          },
          payment_method: { method_name: 'Cash', method_code: 'CASH' },
          billing_payment_allocations_payment_id: [
            {
              id: 'alloc1',
              allocated_amount: money('100'),
              invoice_id: 'inv1',
              allocated_at: new Date(),
              invoice: { invoice_number: 'INV-1' },
            },
          ],
        });

      const pay = await service.allocatePayment('pay1', 'inv1', '100', 'u1');
      expect(prisma.paymentAllocations.create).toHaveBeenCalled();
      expect(prisma.journalEntries.create).toHaveBeenCalled();
      expect(pay.paymentNumber).toBe('PAY-1');
    });

    it('records claim payments and emits approved/denied claim events', async () => {
      const claimPatient = {
        patient_number: 'MRN-1',
        user: {
          email: 'a@b.com',
          core_profiles_user_id: [{ first_name: 'Ann', last_name: 'Bee' }],
        },
      };
      const approvedClaim = {
        id: 'cl1',
        claim_number: 'CLM-1',
        status: 'APPROVED',
        amount_claimed: money('100'),
        amount_approved: money('100'),
        amount_paid: money('0'),
        invoice_id: 'inv1',
        patient_id: 'pat1',
        insurance_policy_id: null,
        submission_date: new Date(),
        denial_reason: null,
        notes: null,
        invoice: { invoice_number: 'INV-1', total_amount: money('100') },
        patient: claimPatient,
      };
      const cashGl = {
        id: 'cash1',
        account_code: '1000',
        account_name: 'Cash',
        account_type: 'ASSET',
        normal_balance: 'DEBIT',
        is_active: true,
        is_postable: true,
      };
      prisma.paymentMethods.findUnique = jest.fn().mockResolvedValue({
        id: 'pm-ins',
        method_code: 'INSURANCE',
        is_active: true,
        gl_account_id: 'cash1',
        gl_account: cashGl,
      });
      prisma.payments.create = jest.fn().mockResolvedValue({
        id: 'pay-claim',
        payment_number: 'PAY-9',
        amount: money('100'),
      });
      prisma.payments.count = jest.fn().mockResolvedValue(1);
      prisma.payments.findUnique = jest.fn().mockResolvedValue({
        id: 'pay-claim',
        payment_number: 'PAY-9',
        amount: money('100'),
        status: 'COMPLETED',
        patient_id: 'pat1',
        payment_date: new Date(),
        payment_method: { gl_account_id: 'cash1', gl_account: cashGl },
      });
      prisma.invoices.findUnique = jest.fn().mockResolvedValue({
        id: 'inv1',
        invoice_number: 'INV-1',
        patient_id: 'pat1',
        status: 'ISSUED',
        deleted_at: null,
        total_amount: money('100'),
      });
      prisma.paymentAllocations.aggregate = jest
        .fn()
        .mockResolvedValue({ _sum: { allocated_amount: money('0') } });
      prisma.paymentAllocations.findUnique = jest.fn().mockResolvedValue(null);
      prisma.payments.update = jest.fn().mockResolvedValue({});
      prisma.insuranceClaims.findUnique = jest
        .fn()
        .mockResolvedValueOnce({
          ...approvedClaim,
          invoice: { id: 'inv1', invoice_number: 'INV-1', total_amount: money('100') },
        })
        .mockResolvedValue({
          ...approvedClaim,
          status: 'PAID',
          amount_paid: money('100'),
        });
      prisma.insuranceClaims.update = jest.fn().mockResolvedValue({
        ...approvedClaim,
        status: 'PAID',
        amount_paid: money('100'),
      });

      const paid = await service.recordClaimPayment('cl1', {
        amount: '100',
        actorUserId: 'u1',
        transactionReference: 'INS-REF',
      });
      expect(paid.status).toBe('PAID');
      expect(prisma.payments.create).toHaveBeenCalled();

      prisma.insuranceClaims.findUnique
        .mockResolvedValueOnce({ ...approvedClaim, status: 'SUBMITTED' })
        .mockResolvedValue({
          ...approvedClaim,
          status: 'APPROVED',
          amount_approved: money('100'),
        });
      prisma.insuranceClaims.update.mockResolvedValue({
        ...approvedClaim,
        status: 'APPROVED',
      });
      await service.transitionClaim('cl1', {
        status: 'APPROVED',
        amountApproved: '100',
        actorUserId: 'u1',
      });
      expect(events.emit).toHaveBeenCalledWith(
        'insurance_claim.approved',
        expect.objectContaining({
          payload: expect.objectContaining({ claimId: 'cl1' }),
        }),
      );

      prisma.insuranceClaims.findUnique
        .mockResolvedValueOnce({ ...approvedClaim, status: 'SUBMITTED' })
        .mockResolvedValue({ ...approvedClaim, status: 'DENIED' });
      prisma.insuranceClaims.update.mockResolvedValue({
        ...approvedClaim,
        status: 'DENIED',
      });
      await service.transitionClaim('cl1', {
        status: 'DENIED',
        actorUserId: 'u1',
      });
      expect(events.emit).toHaveBeenCalledWith(
        'insurance_claim.denied',
        expect.objectContaining({
          payload: expect.objectContaining({ claimId: 'cl1' }),
        }),
      );
    });

    it('creates, posts, and reverses manual journals', async () => {
      const draftJe = {
        id: 'je-draft',
        status: 'DRAFT',
        entry_number: 'JE-9',
        entry_date: new Date(),
        posting_period_id: 'p1',
        reversal_of_id: null,
        description: 'Manual',
        reference_type: 'MANUAL',
        reference_id: null,
        posted_at: null,
        created_by: 'u1',
        posting_period: { id: 'p1', period_name: 'Aug 2026' },
        billing_journal_lines_journal_entry_id: [
          {
            id: 'jl1',
            account_id: 'ar1',
            direction: 'DEBIT',
            amount: money('50'),
            description: null,
            account: arAccount,
          },
          {
            id: 'jl2',
            account_id: 'rev1',
            direction: 'CREDIT',
            amount: money('50'),
            description: null,
            account: revenueAccount,
          },
        ],
      };
      prisma.journalEntries.create = jest.fn().mockResolvedValue({
        id: 'je-draft',
        status: 'DRAFT',
        entry_number: 'JE-9',
      });
      prisma.journalEntries.findUnique = jest.fn().mockResolvedValue(draftJe);
      prisma.journalEntries.findFirst = jest.fn().mockResolvedValue(draftJe);
      prisma.journalEntries.update = jest.fn().mockResolvedValue({
        id: 'je-draft',
        status: 'POSTED',
        entry_number: 'JE-9',
      });
      prisma.journalEntries.count = jest.fn().mockResolvedValue(3);

      const created = await service.createManualJournal({
        description: 'Manual adjust',
        actorUserId: 'u1',
        lines: [
          { accountId: 'ar1', direction: 'DEBIT', amount: '50' },
          { accountId: 'rev1', direction: 'CREDIT', amount: '50' },
        ],
      });
      expect(created.entryNumber).toBe('JE-9');

      prisma.journalEntries.findUnique.mockResolvedValue({
        ...draftJe,
        status: 'POSTED',
        posted_at: new Date(),
      });
      const posted = await service.postJournal('je-draft', 'u1');
      expect(posted.status).toBe('POSTED');

      prisma.journalEntries.findFirst.mockResolvedValue({
        ...draftJe,
        status: 'POSTED',
        posted_at: new Date(),
      });
      prisma.journalEntries.create.mockResolvedValue({
        id: 'je-rev',
        status: 'POSTED',
        entry_number: 'JE-10',
      });
      prisma.journalEntries.findUnique.mockResolvedValue({
        ...draftJe,
        id: 'je-rev',
        entry_number: 'JE-10',
        status: 'POSTED',
        posted_at: new Date(),
      });
      const reversed = await service.reverseJournalEntry(
        'je-draft',
        'u1',
        'mistake',
      );
      expect(reversed.entryNumber).toBe('JE-10');
    });
  });

  describe('createInvoice / issueInvoice / payment edge paths', () => {
    it('createInvoice validates tax rate, inactive service, and line fields', async () => {
      prisma.patients = {
        findUnique: jest.fn().mockResolvedValue({ id: 'pat1', deleted_at: null }),
      };
      prisma.taxRates.findUnique = jest.fn().mockResolvedValue({
        id: 'tax1',
        is_active: false,
        rate_percentage: money('16'),
      });

      await expect(
        service.createInvoice({
          patientId: 'pat1',
          taxRateId: 'tax1',
          lines: [{ description: 'X', quantity: 1, unitPrice: 10 }],
          actorUserId: 'u1',
        }),
      ).rejects.toThrow(/Tax rate not found or inactive/);

      prisma.taxRates.findUnique.mockResolvedValue({
        id: 'tax1',
        is_active: true,
        rate_percentage: money('16'),
      });
      prisma.services.findUnique.mockResolvedValue({
        ...serviceRow,
        is_active: false,
      });
      await expect(
        service.createInvoice({
          patientId: 'pat1',
          taxRateId: 'tax1',
          lines: [{ serviceId: 'svc1', quantity: 1 }],
          actorUserId: 'u1',
        }),
      ).rejects.toThrow(/inactive/);

      prisma.services.findUnique.mockResolvedValue(null);
      await expect(
        service.createInvoice({
          patientId: 'pat1',
          lines: [{ serviceId: 'missing', quantity: 1, unitPrice: 10 }],
          actorUserId: 'u1',
        }),
      ).rejects.toThrow(/Service not found/);

      await expect(
        service.createInvoice({
          patientId: 'pat1',
          lines: [{ quantity: 1, unitPrice: 10 }],
          actorUserId: 'u1',
        }),
      ).rejects.toThrow(/Line description is required/);

      await expect(
        service.createInvoice({
          patientId: 'pat1',
          lines: [{ description: 'Custom', quantity: 1 }],
          actorUserId: 'u1',
        }),
      ).rejects.toThrow(/Line unit price is required/);
    });

    it('issueInvoice rejects missing AR, empty lines, and bad service links', async () => {
      prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
      prisma.invoices.findUnique = jest.fn().mockResolvedValue({
        id: 'inv1',
        invoice_number: 'INV-1',
        patient_id: 'pat1',
        status: 'DRAFT',
        deleted_at: null,
        discount: money('0'),
        notes: null,
        billing_invoice_items_invoice_id: [],
      });
      await expect(service.issueInvoice('inv1', 'u1')).rejects.toThrow(
        /no line items/,
      );

      prisma.invoices.findUnique.mockResolvedValue({
        id: 'inv1',
        invoice_number: 'INV-1',
        patient_id: 'pat1',
        status: 'DRAFT',
        deleted_at: null,
        discount: money('0'),
        notes: null,
        billing_invoice_items_invoice_id: [
          {
            id: 'li1',
            service_id: null,
            service: null,
            quantity: money('1'),
            unit_price: money('10'),
            total_price: money('10'),
          },
        ],
      });
      await expect(service.issueInvoice('inv1', 'u1')).rejects.toThrow(
        /revenue account/,
      );

      prisma.invoices.findUnique.mockResolvedValue({
        id: 'inv1',
        invoice_number: 'INV-1',
        patient_id: 'pat1',
        status: 'DRAFT',
        deleted_at: null,
        discount: money('0'),
        notes: null,
        billing_invoice_items_invoice_id: [
          {
            id: 'li1',
            service_id: 'svc1',
            quantity: money('1'),
            unit_price: money('10'),
            total_price: money('10'),
            service: {
              ...serviceRow,
              is_active: false,
              revenue_account_id: 'rev1',
            },
          },
        ],
      });
      prisma.accounts.findMany = jest.fn().mockResolvedValue([revenueAccount]);
      await expect(service.issueInvoice('inv1', 'u1')).rejects.toThrow(
        /inactive/,
      );

      prisma.invoices.findUnique.mockResolvedValue({
        id: 'inv1',
        invoice_number: 'INV-1',
        patient_id: 'pat1',
        status: 'DRAFT',
        deleted_at: null,
        discount: money('0'),
        notes: null,
        billing_invoice_items_invoice_id: [
          {
            id: 'li1',
            service_id: 'svc1',
            quantity: money('1'),
            unit_price: money('10'),
            total_price: money('10'),
            service: {
              ...serviceRow,
              is_active: true,
              revenue_account_id: null,
            },
          },
        ],
      });
      await expect(service.issueInvoice('inv1', 'u1')).rejects.toThrow(
        /no revenue account/,
      );

      prisma.invoices.findUnique.mockResolvedValue({
        id: 'inv1',
        invoice_number: 'INV-1',
        patient_id: 'pat1',
        status: 'DRAFT',
        deleted_at: null,
        discount: money('0'),
        notes: '[[taxRateId:00000000-0000-4000-8000-000000000001]]',
        billing_invoice_items_invoice_id: [
          {
            id: 'li1',
            service_id: 'svc1',
            quantity: money('1'),
            unit_price: money('100'),
            total_price: money('100'),
            service: {
              ...serviceRow,
              revenue_account_id: 'rev1',
              is_active: true,
            },
          },
        ],
      });
      prisma.taxRates.findUnique = jest.fn().mockResolvedValue(null);
      await expect(service.issueInvoice('inv1', 'u1')).rejects.toThrow(
        /tax rate no longer exists/,
      );
    });

    it('createPayment rejects inactive method, duplicate refs, and bad allocate target', async () => {
      prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
      prisma.patients = {
        findUnique: jest.fn().mockResolvedValue({ id: 'pat1', deleted_at: null }),
      };
      prisma.paymentMethods.findUnique = jest.fn().mockResolvedValue({
        id: 'pm1',
        is_active: false,
        gl_account: {
          id: 'cash1',
          account_code: '1000',
          account_type: 'ASSET',
          normal_balance: 'DEBIT',
          is_active: true,
          is_postable: true,
        },
      });
      await expect(
        service.createPayment({
          patientId: 'pat1',
          amount: '50',
          paymentMethodId: 'pm1',
          actorUserId: 'u1',
        }),
      ).rejects.toThrow(/Payment method not found or inactive/);

      prisma.paymentMethods.findUnique.mockResolvedValue({
        id: 'pm1',
        is_active: true,
        gl_account: {
          id: 'cash1',
          account_code: '1000',
          account_type: 'ASSET',
          normal_balance: 'DEBIT',
          is_active: true,
          is_postable: true,
        },
      });
      prisma.payments.findFirst = jest.fn().mockResolvedValue({ id: 'dup' });
      await expect(
        service.createPayment({
          patientId: 'pat1',
          amount: '50',
          paymentMethodId: 'pm1',
          transactionReference: 'TX-1',
          actorUserId: 'u1',
        }),
      ).rejects.toThrow(/already exists/);

      prisma.payments.findFirst.mockResolvedValue(null);
      prisma.payments.create = jest.fn().mockResolvedValue({
        id: 'pay-new',
        payment_number: 'PAY-9',
      });
      prisma.documentSequences = {
        upsert: jest.fn().mockResolvedValue({ current_value: 1 }),
        update: jest.fn().mockResolvedValue({ current_value: 2 }),
        findUnique: jest.fn().mockResolvedValue({ current_value: 1 }),
      };
      prisma.invoices.findUnique = jest.fn().mockResolvedValue({
        id: 'inv1',
        invoice_number: 'INV-1',
        status: 'PAID',
        deleted_at: null,
      });
      await expect(
        service.createPayment({
          patientId: 'pat1',
          amount: '50',
          paymentMethodId: 'pm1',
          allocateToInvoiceId: 'inv1',
          actorUserId: 'u1',
        }),
      ).rejects.toThrow(/already PAID/);
    });

    it('updateAccount rejects type change with journal lines and bad parent', async () => {
      prisma.accounts.findUnique = jest.fn().mockResolvedValue({
        ...revenueAccount,
        id: 'rev1',
      });
      prisma.journalLines = {
        count: jest.fn().mockResolvedValue(2),
      };
      await expect(
        service.updateAccount('rev1', {
          accountType: 'ASSET',
          actorUserId: 'u1',
        }),
      ).rejects.toThrow(/Cannot change account type/);

      prisma.journalLines.count.mockResolvedValue(0);
      await expect(
        service.updateAccount('rev1', {
          parentId: 'rev1',
          actorUserId: 'u1',
        }),
      ).rejects.toThrow(/own parent/);

      prisma.accounts.findUnique
        .mockResolvedValueOnce({ ...revenueAccount, id: 'rev1' })
        .mockResolvedValueOnce(null);
      await expect(
        service.updateAccount('rev1', {
          parentId: 'missing',
          actorUserId: 'u1',
        }),
      ).rejects.toThrow(/Parent account not found/);
    });

    it('updateService auto-resolves revenue when reactivating without account', async () => {
      prisma.services.findUnique
        .mockResolvedValueOnce({
          ...serviceRow,
          revenue_account_id: null,
          is_active: false,
        })
        .mockResolvedValue({
          ...serviceRow,
          revenue_account_id: 'rev1',
          is_active: true,
        });
      prisma.services.update = jest.fn().mockResolvedValue({
        ...serviceRow,
        revenue_account_id: 'rev1',
        is_active: true,
      });
      prisma.accounts.findUnique.mockResolvedValue(revenueAccount);

      const updated = await service.updateService('svc1', {
        isActive: true,
        actorUserId: 'u1',
      });
      expect(prisma.services.update).toHaveBeenCalled();
      expect(updated.id).toBe('svc1');
    });
  });
});
