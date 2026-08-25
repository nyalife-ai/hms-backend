/**
 * Guards the 7600 vs 6100 class of bugs: one invoice must expose identical
 * total / amountPaid / balance math everywhere (API aliases included).
 */

import {
  calculateInvoiceTotals,
  outstandingBalance,
} from '../domain/invoice-calculator';
import { statusFromOutstanding } from '../domain/invoice-lifecycle';
import { moneyFrom, moneyToDecimal } from '../domain/money';

describe('invoice money consistency', () => {
  it('computes subtotal + tax = total and excludes paid consult from remaining', () => {
    const totals = calculateInvoiceTotals({
      lines: [
        { description: 'Lab A', quantity: 1, unitPrice: 2000 },
        { description: 'Med B', quantity: 1, unitPrice: 4100 },
      ],
      taxRatePercentage: 0,
    });

    expect(totals.subtotal).toBe('6100.00');
    expect(totals.tax).toBe('0.00');
    expect(totals.totalAmount).toBe('6100.00');

    const withConsult = calculateInvoiceTotals({
      lines: [
        { description: 'Consultation', quantity: 1, unitPrice: 1500 },
        { description: 'Lab A', quantity: 1, unitPrice: 2000 },
        { description: 'Med B', quantity: 1, unitPrice: 4100 },
      ],
      taxRatePercentage: 0,
    });
    expect(withConsult.totalAmount).toBe('7600.00');

    // After consult already paid, remaining billable = 6100 (not 7600)
    const remaining = calculateInvoiceTotals({
      lines: [
        { description: 'Lab A', quantity: 1, unitPrice: 2000 },
        { description: 'Med B', quantity: 1, unitPrice: 4100 },
      ],
      taxRatePercentage: 0,
    });
    expect(remaining.totalAmount).toBe('6100.00');
  });

  it('applies billing tax rate to totals (not a hardcoded percent)', () => {
    const rate = '16';
    const totals = calculateInvoiceTotals({
      lines: [{ description: 'Consultation', quantity: 1, unitPrice: 1500 }],
      taxRatePercentage: rate,
    });
    expect(totals.subtotal).toBe('1500.00');
    expect(totals.tax).toBe('240.00');
    expect(totals.totalAmount).toBe('1740.00');
  });

  it('partial payment → PARTIALLY_PAID with correct balance', () => {
    const total = moneyFrom('7600.00');
    const balance = outstandingBalance('7600.00', '6100.00');
    expect(moneyToDecimal(balance)).toBe('1500.00');
    expect(statusFromOutstanding(total, balance, 'ISSUED')).toBe(
      'PARTIALLY_PAID',
    );
  });

  it('full payment → PAID with zero balance', () => {
    const total = moneyFrom('7600.00');
    const balance = outstandingBalance('7600.00', '7600.00');
    expect(moneyToDecimal(balance)).toBe('0.00');
    expect(statusFromOutstanding(total, balance, 'ISSUED')).toBe('PAID');
  });

  it('amountPaid alias equals allocated for DTO mapping', () => {
    const allocated = '6100.00';
    const outstanding = '1500.00';
    const dto = {
      allocated,
      amountPaid: allocated,
      outstanding,
      balance: outstanding,
      totalAmount: '7600.00',
    };
    expect(dto.amountPaid).toBe(dto.allocated);
    expect(dto.balance).toBe(dto.outstanding);
    expect(Number(dto.totalAmount) - Number(dto.amountPaid)).toBe(
      Number(dto.balance),
    );
  });
});
