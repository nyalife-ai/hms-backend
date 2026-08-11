/**
 * Billing domain unit tests — money math, invoice calc, transitions, accounts.
 */

import { BadRequestException } from '@nestjs/common';
import { assertAccountTypeBalance } from '../domain/account-rules';
import { assertClaimAmounts, assertClaimTransition } from '../domain/claim-lifecycle';
import {
  calculateInvoiceTotals,
  outstandingBalance,
} from '../domain/invoice-calculator';
import {
  assertInvoiceTransition,
  statusFromOutstanding,
} from '../domain/invoice-lifecycle';
import { moneyFrom, taxOn } from '../domain/money';
import { assertJournalBalanced } from '../finance/journal.engine';

describe('Billing domain', () => {
  describe('invoice calculator', () => {
    it('computes qty × price, discount then tax', () => {
      const totals = calculateInvoiceTotals({
        lines: [
          { quantity: 2, unitPrice: '1000.00' },
          { quantity: 1, unitPrice: '500.00' },
        ],
        discount: '100.00',
        taxRatePercentage: '16',
      });
      expect(totals.subtotal).toBe('2500.00');
      expect(totals.discount).toBe('100.00');
      expect(totals.taxable).toBe('2400.00');
      expect(totals.tax).toBe('384.00');
      expect(totals.totalAmount).toBe('2784.00');
      expect(totals.lines[0].totalPrice).toBe('2000.00');
    });

    it('rejects discount above subtotal', () => {
      expect(() =>
        calculateInvoiceTotals({
          lines: [{ quantity: 1, unitPrice: '100' }],
          discount: '200',
        }),
      ).toThrow(BadRequestException);
    });

    it('ignores floating noise via minor units', () => {
      const tax = taxOn(moneyFrom('100.00'), '16');
      expect(tax.toDecimalString()).toBe('16.00');
    });
  });

  describe('outstanding + invoice status', () => {
    it('tracks partial then paid', () => {
      const total = moneyFrom('10000');
      const o1 = outstandingBalance('10000', '4000');
      expect(statusFromOutstanding(total, o1, 'ISSUED')).toBe('PARTIALLY_PAID');
      const o2 = outstandingBalance('10000', '10000');
      expect(statusFromOutstanding(total, o2, 'PARTIALLY_PAID')).toBe('PAID');
    });

    it('rejects over-allocation', () => {
      expect(() => outstandingBalance('100', '150')).toThrow(BadRequestException);
    });

    it('blocks illegal invoice transitions', () => {
      expect(() => assertInvoiceTransition('PAID', 'DRAFT')).toThrow(
        BadRequestException,
      );
      expect(() => assertInvoiceTransition('DRAFT', 'ISSUED')).not.toThrow();
    });
  });

  describe('accounts', () => {
    it('enforces type/normal balance pairing', () => {
      expect(() => assertAccountTypeBalance('REVENUE', 'DEBIT')).toThrow(
        BadRequestException,
      );
      expect(() => assertAccountTypeBalance('ASSET', 'DEBIT')).not.toThrow();
      expect(() => assertAccountTypeBalance('LIABILITY', 'CREDIT')).not.toThrow();
    });
  });

  describe('claims', () => {
    it('validates amount relationships', () => {
      expect(() =>
        assertClaimAmounts({ claimed: 1000, approved: 1200 }),
      ).toThrow(BadRequestException);
      expect(() =>
        assertClaimAmounts({ claimed: 1000, approved: 800, paid: 900 }),
      ).toThrow(BadRequestException);
      expect(() =>
        assertClaimAmounts({ claimed: 1000, approved: 800, paid: 500 }),
      ).not.toThrow();
    });

    it('blocks illegal claim transitions', () => {
      expect(() => assertClaimTransition('PAID', 'DRAFT')).toThrow(
        BadRequestException,
      );
      expect(() => assertClaimTransition('DRAFT', 'SUBMITTED')).not.toThrow();
    });
  });

  describe('journal balancing', () => {
    it('requires debits = credits', () => {
      expect(() =>
        assertJournalBalanced([
          { accountId: 'a', direction: 'DEBIT', amount: '100' },
          { accountId: 'b', direction: 'CREDIT', amount: '90' },
        ]),
      ).toThrow(BadRequestException);

      expect(() =>
        assertJournalBalanced([
          { accountId: 'a', direction: 'DEBIT', amount: '100.00' },
          { accountId: 'b', direction: 'CREDIT', amount: '100.00' },
        ]),
      ).not.toThrow();
    });
  });
});
