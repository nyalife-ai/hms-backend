/**
 * Billing money helpers — integer minor units via shared Money (KES).
 * Never use floating-point as the authoritative source.
 */

import { BadRequestException } from '@nestjs/common';
import { Money } from '../../../shared/money/money';

export const BILLING_CURRENCY = 'KES';

export function moneyFrom(value: string | number | { toString(): string }): Money {
  const raw =
    typeof value === 'number'
      ? value.toFixed(2)
      : String(value).trim();
  try {
    return Money.fromDecimalString(raw, BILLING_CURRENCY, 2);
  } catch (err) {
    throw new BadRequestException(
      err instanceof Error ? err.message : 'Invalid monetary amount',
    );
  }
}

export function moneyZero(): Money {
  return Money.zero(BILLING_CURRENCY, 2);
}

export function moneyToDecimal(m: Money): string {
  return m.toDecimalString();
}

/** Half-up style percent of amount: amount * rate% (rate is e.g. 16 for 16%). */
export function taxOn(taxable: Money, ratePercentage: string | number): Money {
  const rate = moneyFrom(ratePercentage);
  // rate is stored as percentage points (16.00 = 16%), convert to fraction via minor units
  // taxable.minor * rate.minor / (100 * 100) with round
  const taxableMinor = taxable.amount;
  const rateMinor = rate.amount; // e.g. 16.00 → 1600
  const product = taxableMinor * rateMinor;
  const rounded = Math.round(product / 10000);
  return Money.of(rounded, BILLING_CURRENCY, 2);
}

export function assertNonNegative(m: Money, label: string): void {
  if (m.isNegative()) {
    throw new BadRequestException(`${label} cannot be negative`);
  }
}

export function assertPositive(m: Money, label: string): void {
  if (!m.isPositive()) {
    throw new BadRequestException(`${label} must be greater than zero`);
  }
}
