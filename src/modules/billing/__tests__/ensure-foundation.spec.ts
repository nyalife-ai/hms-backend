/**
 * ensureBillingFoundation + backfillServiceRevenueAccounts with Prisma mocks.
 */

import {
  backfillServiceRevenueAccounts,
  ensureBillingFoundation,
} from '../finance/ensure-foundation';
import { REVENUE_ACCOUNT_CODES } from '../domain/service-revenue-account';

function mockDb() {
  const accountsByCode = new Map<string, { id: string; account_code: string }>();
  let idSeq = 0;
  const nextId = (prefix: string) => `${prefix}-${++idSeq}`;

  const accounts = {
    upsert: jest.fn(async ({ where, create }: any) => {
      const code = where.account_code;
      const existing = accountsByCode.get(code);
      if (existing) return existing;
      const row = { id: nextId('acc'), account_code: code, ...create };
      accountsByCode.set(code, row);
      return row;
    }),
    findMany: jest.fn(async ({ where }: any) => {
      const codes: string[] = where?.account_code?.in ?? [];
      return codes
        .map((c) => accountsByCode.get(c))
        .filter(Boolean)
        .map((a) => ({ id: a!.id, account_code: a!.account_code }));
    }),
  };

  const paymentMethods = {
    upsert: jest.fn().mockResolvedValue({}),
  };

  const services = {
    upsert: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
  };

  const taxRates = {
    upsert: jest.fn().mockResolvedValue({}),
  };

  const postingPeriods = {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
  };

  return {
    accounts,
    paymentMethods,
    services,
    taxRates,
    postingPeriods,
    accountsByCode,
  };
}

describe('ensureBillingFoundation', () => {
  it('upserts COA, payment methods, fee services, tax, and open period', async () => {
    const db = mockDb();
    await ensureBillingFoundation(db as never);

    expect(db.accounts.upsert).toHaveBeenCalled();
    expect(db.paymentMethods.upsert).toHaveBeenCalledTimes(3);
    expect(db.services.upsert).toHaveBeenCalledTimes(5);
    expect(db.taxRates.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tax_code: 'VAT0' } }),
    );
    expect(db.postingPeriods.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'OPEN' }),
      }),
    );
  });

  it('creates a current-month open period when FY exists but is closed', async () => {
    const db = mockDb();
    const year = new Date().getFullYear();
    db.postingPeriods.findFirst
      .mockResolvedValueOnce({
        id: 'fy',
        fiscal_year: year,
        status: 'CLOSED',
      })
      .mockResolvedValueOnce(null);

    await ensureBillingFoundation(db as never);

    expect(db.postingPeriods.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'OPEN',
          fiscal_year: year,
        }),
      }),
    );
  });

  it('skips period create when an open period already covers today', async () => {
    const db = mockDb();
    const year = new Date().getFullYear();
    db.postingPeriods.findFirst
      .mockResolvedValueOnce({
        id: 'fy',
        fiscal_year: year,
        status: 'LOCKED',
      })
      .mockResolvedValueOnce({ id: 'open-month', status: 'OPEN' });

    await ensureBillingFoundation(db as never);
    expect(db.postingPeriods.create).not.toHaveBeenCalled();
  });
});

describe('backfillServiceRevenueAccounts', () => {
  it('returns zeros when no revenue accounts exist', async () => {
    const db = mockDb();
    db.accounts.findMany.mockResolvedValue([]);
    const result = await backfillServiceRevenueAccounts(db as never);
    expect(result).toEqual({ updated: 0, stillUnmapped: 0 });
    expect(db.services.findMany).not.toHaveBeenCalled();
  });

  it('maps unmapped services to revenue leaves and reports remainder', async () => {
    const db = mockDb();
    // Only laboratory leaf present — consultation-mapped rows are skipped.
    db.accounts.findMany.mockResolvedValue([
      { id: 'rev-lab', account_code: REVENUE_ACCOUNT_CODES.LABORATORY },
    ]);
    db.services.findMany.mockResolvedValue([
      {
        id: 's1',
        service_code: 'LAB-CBC',
        service_name: 'CBC',
        category: 'Laboratory',
      },
      {
        id: 's2',
        service_code: 'GEN-1',
        service_name: 'General fee',
        category: 'Consultation',
      },
    ]);
    db.services.count.mockResolvedValue(1);

    const result = await backfillServiceRevenueAccounts(db as never);

    expect(db.services.update).toHaveBeenCalledTimes(1);
    expect(db.services.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { revenue_account_id: 'rev-lab' },
    });
    expect(result).toEqual({ updated: 1, stillUnmapped: 1 });
  });
});
