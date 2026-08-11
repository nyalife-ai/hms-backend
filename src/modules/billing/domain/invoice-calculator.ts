/**
 * Invoice totals — server authoritative.
 *
 * Calculation order:
 *   line_total = quantity × unit_price
 *   subtotal   = Σ line_total
 *   taxable    = subtotal − discount
 *   tax        = taxable × tax_rate%   (0 when no rate)
 *   total      = taxable + tax
 */

import { BadRequestException } from '@nestjs/common';
import { Money } from '../../../shared/money/money';
import {
  assertNonNegative,
  moneyFrom,
  moneyToDecimal,
  moneyZero,
  taxOn,
} from './money';

export type InvoiceLineInput = {
  quantity: string | number;
  unitPrice: string | number;
  description?: string;
  serviceId?: string | null;
};

export type CalculatedLine = {
  quantity: string;
  unitPrice: string;
  totalPrice: string;
};

export type InvoiceTotals = {
  lines: CalculatedLine[];
  subtotal: string;
  discount: string;
  tax: string;
  totalAmount: string;
  taxable: string;
};

export function calculateInvoiceTotals(input: {
  lines: InvoiceLineInput[];
  discount?: string | number;
  taxRatePercentage?: string | number | null;
}): InvoiceTotals {
  if (!input.lines.length) {
    throw new BadRequestException('Invoice must have at least one line item');
  }

  let subtotal = moneyZero();
  const lines: CalculatedLine[] = [];

  for (const line of input.lines) {
    const qty = moneyFrom(line.quantity);
    const unit = moneyFrom(line.unitPrice);
    if (!qty.isPositive()) {
      throw new BadRequestException('Line quantity must be greater than zero');
    }
    assertNonNegative(unit, 'Unit price');
    const lineTotal = Money.of(
      Math.round((qty.amount * unit.amount) / 100),
      'KES',
      2,
    );
    assertNonNegative(lineTotal, 'Line total');
    subtotal = subtotal.add(lineTotal);
    lines.push({
      quantity: moneyToDecimal(qty),
      unitPrice: moneyToDecimal(unit),
      totalPrice: moneyToDecimal(lineTotal),
    });
  }

  const discount = moneyFrom(input.discount ?? 0);
  assertNonNegative(discount, 'Discount');
  if (discount.compareTo(subtotal) > 0) {
    throw new BadRequestException('Discount cannot exceed subtotal');
  }

  const taxable = subtotal.subtract(discount);
  assertNonNegative(taxable, 'Taxable amount');

  let tax = moneyZero();
  if (
    input.taxRatePercentage !== undefined &&
    input.taxRatePercentage !== null &&
    String(input.taxRatePercentage) !== '' &&
    Number(input.taxRatePercentage) !== 0
  ) {
    tax = taxOn(taxable, input.taxRatePercentage);
  }
  assertNonNegative(tax, 'Tax');

  const total = taxable.add(tax);

  return {
    lines,
    subtotal: moneyToDecimal(subtotal),
    discount: moneyToDecimal(discount),
    tax: moneyToDecimal(tax),
    totalAmount: moneyToDecimal(total),
    taxable: moneyToDecimal(taxable),
  };
}

export function outstandingBalance(
  totalAmount: string | number,
  allocated: string | number,
) {
  const total = moneyFrom(totalAmount);
  const paid = moneyFrom(allocated);
  assertNonNegative(paid, 'Allocated amount');
  if (paid.compareTo(total) > 0) {
    throw new BadRequestException(
      'Allocated payments exceed the invoice total',
    );
  }
  return total.subtract(paid);
}
