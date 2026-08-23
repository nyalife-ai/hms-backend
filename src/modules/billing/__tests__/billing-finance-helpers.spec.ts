/**
 * Billing finance helpers — money, numbering, period resolver.
 */

import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma';
import {
  assertNonNegative,
  assertPositive,
  moneyFrom,
  moneyToDecimal,
  moneyZero,
  taxOn,
} from '../domain/money';
import {
  isUniqueViolation,
  nextDocumentNumber,
  withNumberRetry,
} from '../finance/numbering';
import { resolveOpenPeriod } from '../finance/period-resolver';

describe('billing money helpers', () => {
  it('parses amounts and computes tax', () => {
    expect(moneyToDecimal(moneyFrom('100.50'))).toBe('100.50');
    expect(moneyToDecimal(moneyZero())).toBe('0.00');
    expect(moneyToDecimal(taxOn(moneyFrom('100'), 16))).toBe('16.00');
    expect(() => moneyFrom('not-a-number')).toThrow(BadRequestException);
  });

  it('asserts sign constraints', () => {
    expect(() => assertNonNegative(moneyFrom('-1'), 'amount')).toThrow(BadRequestException);
    expect(() => assertPositive(moneyZero(), 'amount')).toThrow(BadRequestException);
    expect(() => assertPositive(moneyFrom('1'), 'amount')).not.toThrow();
  });
});

describe('document numbering', () => {
  it('allocates sequential document numbers by kind', async () => {
    const tx = {
      invoices: { count: jest.fn().mockResolvedValue(2) },
      payments: { count: jest.fn().mockResolvedValue(0) },
      journalEntries: { count: jest.fn().mockResolvedValue(4) },
      insuranceClaims: { count: jest.fn().mockResolvedValue(1) },
    };
    const year = new Date().getFullYear();
    expect(await nextDocumentNumber(tx, 'INV')).toBe(`INV-${year}-0003`);
    expect(await nextDocumentNumber(tx, 'PAY')).toBe(`PAY-${year}-0001`);
    expect(await nextDocumentNumber(tx, 'JE')).toBe(`JE-${year}-0005`);
    expect(await nextDocumentNumber(tx, 'CLM')).toBe(`CLM-${year}-0002`);
  });

  it('retries on unique violations', async () => {
    const unique = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
    });
    expect(isUniqueViolation(unique)).toBe(true);
    expect(isUniqueViolation(new Error('x'))).toBe(false);

    let attempts = 0;
    const value = await withNumberRetry(async (attempt) => {
      attempts += 1;
      if (attempt < 2) throw unique;
      return `INV-ok-${attempt}`;
    });
    expect(value).toBe('INV-ok-2');
    expect(attempts).toBe(3);

    await expect(
      withNumberRetry(async () => {
        throw unique;
      }, 2),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

    await expect(
      withNumberRetry(async () => {
        throw new Error('other');
      }),
    ).rejects.toThrow('other');
  });
});

describe('resolveOpenPeriod', () => {
  it('returns an open period covering the entry date', async () => {
    const period = {
      id: 'p1',
      period_name: '2026-01',
      status: 'OPEN',
      start_date: new Date('2026-01-01'),
      end_date: new Date('2026-01-31'),
      fiscal_year: 2026,
    };
    const prisma = {
      postingPeriods: { findFirst: jest.fn().mockResolvedValue(period) },
    };
    await expect(resolveOpenPeriod(prisma as never, new Date('2026-01-15'))).resolves.toEqual(period);
  });

  it('rejects missing or closed periods', async () => {
    const prisma = {
      postingPeriods: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    await expect(resolveOpenPeriod(prisma as never, new Date('2026-01-15'))).rejects.toThrow(BadRequestException);

    prisma.postingPeriods.findFirst.mockResolvedValue({
      id: 'p1',
      period_name: '2026-01',
      status: 'CLOSED',
      start_date: new Date('2026-01-01'),
      end_date: new Date('2026-01-31'),
      fiscal_year: 2026,
    });
    await expect(resolveOpenPeriod(prisma as never, new Date('2026-01-15'))).rejects.toThrow(/closed/i);
  });
});
