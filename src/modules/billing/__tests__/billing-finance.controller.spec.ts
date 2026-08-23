/**
 * BillingFinanceController — delegates query parsing to finance/settlement.
 */

import { BillingFinanceController } from '../billing-finance.controller';
import { BillingFinanceService } from '../billing-finance.service';
import { BillingSettlementService } from '../billing-settlement.service';

describe('BillingFinanceController', () => {
  const finance = {
    overview: jest.fn().mockResolvedValue({ ok: 1 }),
    listServices: jest.fn().mockResolvedValue({ items: [] }),
    servicesSummary: jest.fn().mockResolvedValue({ total: 0 }),
    getService: jest.fn().mockResolvedValue({ id: 's1' }),
    createService: jest.fn().mockResolvedValue({ id: 's1' }),
    updateService: jest.fn().mockResolvedValue({ id: 's1' }),
    listAccounts: jest.fn().mockResolvedValue({ items: [] }),
    accountsSummary: jest.fn().mockResolvedValue({ total: 0 }),
    createAccount: jest.fn().mockResolvedValue({ id: 'a1' }),
    updateAccount: jest.fn().mockResolvedValue({ id: 'a1' }),
    listTaxRates: jest.fn().mockResolvedValue({ items: [] }),
    createTaxRate: jest.fn().mockResolvedValue({ id: 't1' }),
    updateTaxRate: jest.fn().mockResolvedValue({ id: 't1' }),
    listPeriods: jest.fn().mockResolvedValue({ items: [] }),
    createPeriod: jest.fn().mockResolvedValue({ id: 'p1' }),
    setPeriodStatus: jest.fn().mockResolvedValue({ id: 'p1' }),
    listPaymentMethods: jest.fn().mockResolvedValue([]),
    updatePaymentMethod: jest.fn().mockResolvedValue({ id: 'pm1' }),
    listInvoices: jest.fn().mockResolvedValue({ items: [] }),
    invoicesSummary: jest.fn().mockResolvedValue({ total: 0 }),
    getInvoice: jest.fn().mockResolvedValue({ id: 'i1' }),
    createInvoice: jest.fn().mockResolvedValue({ id: 'i1' }),
    issueInvoice: jest.fn().mockResolvedValue({ id: 'i1' }),
    updateDraftInvoice: jest.fn().mockResolvedValue({ id: 'i1' }),
    voidInvoice: jest.fn().mockResolvedValue({ id: 'i1' }),
    listPayments: jest.fn().mockResolvedValue({ items: [] }),
    paymentsSummary: jest.fn().mockResolvedValue({ total: 0 }),
    getPayment: jest.fn().mockResolvedValue({ id: 'pay1' }),
    createPayment: jest.fn().mockResolvedValue({ id: 'pay1' }),
    allocatePayment: jest.fn().mockResolvedValue({ id: 'alloc1' }),
    listClaims: jest.fn().mockResolvedValue({ items: [] }),
    claimsSummary: jest.fn().mockResolvedValue({ total: 0 }),
    getClaim: jest.fn().mockResolvedValue({ id: 'c1' }),
    createClaim: jest.fn().mockResolvedValue({ id: 'c1' }),
    transitionClaim: jest.fn().mockResolvedValue({ id: 'c1' }),
    recordClaimPayment: jest.fn().mockResolvedValue({ id: 'c1' }),
    listJournals: jest.fn().mockResolvedValue({ items: [] }),
    journalsSummary: jest.fn().mockResolvedValue({ total: 0 }),
    getJournal: jest.fn().mockResolvedValue({ id: 'j1' }),
    createManualJournal: jest.fn().mockResolvedValue({ id: 'j1' }),
    postJournal: jest.fn().mockResolvedValue({ id: 'j1' }),
    reverseJournalEntry: jest.fn().mockResolvedValue({ id: 'j1' }),
  };

  const settlement = {
    quoteVisit: jest.fn().mockResolvedValue({ total: 0 }),
    collectOnInvoice: jest.fn().mockResolvedValue({ id: 'i1' }),
  };

  const controller = new BillingFinanceController(
    finance as unknown as BillingFinanceService,
    settlement as unknown as BillingSettlementService,
  );
  const user = { id: 'u1' } as never;

  beforeEach(() => jest.clearAllMocks());

  it('exposes overview and visit quote', async () => {
    await expect(controller.overview()).resolves.toEqual({ ok: 1 });
    await controller.quoteVisit('1', '2', '3');
    expect(settlement.quoteVisit).toHaveBeenCalledWith({
      consultCount: 1,
      labCount: 2,
      medCount: 3,
    });
  });

  it('delegates services/accounts/tax/periods/methods', async () => {
    await controller.listServices('1', '20', 'q', 'true', 'OPD');
    expect(finance.listServices).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        limit: 20,
        search: 'q',
        active: true,
        category: 'OPD',
      }),
    );
    await controller.servicesSummary();
    await controller.getService('s1');
    await controller.createService(
      { serviceCode: 'X', serviceName: 'Y', standardPrice: 1 },
      user,
    );
    await controller.updateService('s1', { serviceName: 'Z' }, user);

    await controller.listAccounts('1', '10', 'a', 'REVENUE', 'true', 'false');
    expect(finance.listAccounts).toHaveBeenCalledWith(
      expect.objectContaining({
        active: true,
        postable: false,
        accountType: 'REVENUE',
      }),
    );
    await controller.accountsSummary();
    await controller.createAccount(
      {
        accountCode: '1',
        accountName: 'A',
        accountType: 'REVENUE',
        normalBalance: 'CREDIT',
      },
      user,
    );
    await controller.updateAccount('a1', { accountName: 'B' }, user);

    await controller.listTaxRates('1', '10', 'vat', '1');
    await controller.createTaxRate(
      {
        taxName: 'VAT',
        taxCode: 'V',
        ratePercentage: 16,
        liabilityAccountId: 'l1',
      },
      user,
    );
    await controller.updateTaxRate('t1', { taxName: 'VAT2' }, user);

    await controller.listPeriods('1', '10', 'OPEN');
    await controller.createPeriod(
      {
        periodName: 'P',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        fiscalYear: 2026,
      },
      user,
    );
    await controller.setPeriodStatus('p1', { status: 'CLOSED' }, user);

    await controller.listPaymentMethods('true');
    await controller.updatePaymentMethod('pm1', { isActive: false }, user);
  });

  it('delegates invoices/payments/claims/journals', async () => {
    await controller.listInvoices(
      '1',
      '10',
      'q',
      'ISSUED',
      '2026-01-01',
      '2026-12-31',
      'pat1',
    );
    await controller.invoicesSummary();
    await controller.getInvoice('i1');
    await controller.createInvoice({ patientId: 'p1', lines: [] } as never, user);
    await controller.issueInvoice('i1', user);
    await controller.updateDraftInvoice('i1', { notes: 'n' } as never, user);
    await controller.collectInvoice('i1', { mode: 'CASH' } as never, user);
    expect(settlement.collectOnInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: 'i1', mode: 'CASH', actorUserId: 'u1' }),
    );
    await controller.voidInvoice('i1', { reason: 'err' }, user);

    await controller.listPayments('1', '10', undefined, 'COMPLETED');
    await controller.paymentsSummary();
    await controller.getPayment('pay1');
    await controller.createPayment({ amount: '10' } as never, user);
    await controller.allocatePayment('pay1', { invoiceId: 'i1', amount: '10' } as never, user);

    await controller.listClaims('1', '10', 'SUBMITTED');
    await controller.claimsSummary();
    await controller.getClaim('c1');
    await controller.createClaim({ invoiceId: 'i1' } as never, user);
    await controller.transitionClaim('c1', { status: 'APPROVED' } as never, user);
    await controller.recordClaimPayment('c1', { amount: '1' } as never, user);

    await controller.listJournals('1', '10', 'POSTED');
    await controller.journalsSummary();
    await controller.getJournal('j1');
    await controller.createManualJournal({ lines: [] } as never, user);
    await controller.postJournal('j1', user);
    await controller.reverseJournal('j1', { reason: 'fix' }, user);
    expect(finance.reverseJournalEntry).toHaveBeenCalledWith('j1', 'u1', 'fix');
  });
});
