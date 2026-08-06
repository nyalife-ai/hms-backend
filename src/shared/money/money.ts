const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

/**
 * Immutable monetary value stored as integer minor units (e.g. cents).
 *
 * Money deliberately avoids floating point arithmetic — every amount is a
 * safe integer, so `add`/`subtract`/`allocate` never accumulate rounding
 * error. `decimal.js` is available in this project but is not required
 * here: integer minor units are sufficient (and safer) for money math.
 */
export class Money {
  private constructor(
    private readonly amountMinor: number,
    private readonly currencyCode: string,
    private readonly minorUnitDigits: number,
  ) {}

  public static of(
    amountMinor: number,
    currency: string,
    minorUnitDigits = 2,
  ): Money {
    if (!Number.isSafeInteger(amountMinor)) {
      throw new TypeError('Money amount must be a safe integer of minor units');
    }
    if (!CURRENCY_CODE_PATTERN.test(currency)) {
      throw new TypeError(
        'Money currency must be a 3-letter uppercase ISO 4217 code',
      );
    }
    if (!Number.isInteger(minorUnitDigits) || minorUnitDigits < 0) {
      throw new RangeError(
        'Money minorUnitDigits must be a non-negative integer',
      );
    }
    return new Money(amountMinor, currency, minorUnitDigits);
  }

  public static zero(currency: string, minorUnitDigits = 2): Money {
    return Money.of(0, currency, minorUnitDigits);
  }

  /** Parses a decimal string (e.g. `"19.99"`) into minor units for the given currency. */
  public static fromDecimalString(
    value: string,
    currency: string,
    minorUnitDigits = 2,
  ): Money {
    if (!/^-?\d+(\.\d+)?$/.test(value.trim())) {
      throw new TypeError(`Invalid decimal amount: "${value}"`);
    }
    const negative = value.trim().startsWith('-');
    const [wholePart, fractionPart = ''] = value
      .trim()
      .replace('-', '')
      .split('.');
    const fraction = fractionPart.padEnd(minorUnitDigits, '0');
    if (fraction.length > minorUnitDigits) {
      throw new RangeError(
        `Amount "${value}" has more precision than ${minorUnitDigits} minor unit digits allow`,
      );
    }
    const amount = Number(`${wholePart}${fraction}`) * (negative ? -1 : 1);
    return Money.of(amount, currency, minorUnitDigits);
  }

  public get amount(): number {
    return this.amountMinor;
  }

  public get currency(): string {
    return this.currencyCode;
  }

  public add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(
      this.amountMinor + other.amountMinor,
      this.currencyCode,
      this.minorUnitDigits,
    );
  }

  public subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(
      this.amountMinor - other.amountMinor,
      this.currencyCode,
      this.minorUnitDigits,
    );
  }

  public multiply(factor: number): Money {
    if (!Number.isFinite(factor)) {
      throw new TypeError('Money multiplier must be a finite number');
    }
    return Money.of(
      Math.round(this.amountMinor * factor),
      this.currencyCode,
      this.minorUnitDigits,
    );
  }

  public negate(): Money {
    return Money.of(-this.amountMinor, this.currencyCode, this.minorUnitDigits);
  }

  public isZero(): boolean {
    return this.amountMinor === 0;
  }

  public isPositive(): boolean {
    return this.amountMinor > 0;
  }

  public isNegative(): boolean {
    return this.amountMinor < 0;
  }

  public equals(other: Money): boolean {
    return (
      this.currencyCode === other.currencyCode &&
      this.amountMinor === other.amountMinor
    );
  }

  public compareTo(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    if (this.amountMinor === other.amountMinor) return 0;
    return this.amountMinor > other.amountMinor ? 1 : -1;
  }

  /**
   * Splits the amount proportionally across `ratios`, distributing the
   * leftover minor units one at a time (largest-remainder style, in ratio
   * order) so the parts always sum back to the original amount exactly.
   */
  public allocate(ratios: readonly number[]): Money[] {
    if (ratios.length === 0) {
      throw new RangeError('Money allocation requires at least one ratio');
    }
    if (ratios.some((ratio) => !Number.isFinite(ratio) || ratio < 0)) {
      throw new RangeError(
        'Money allocation ratios must be non-negative finite numbers',
      );
    }
    const totalRatio = ratios.reduce((sum, ratio) => sum + ratio, 0);
    if (totalRatio <= 0) {
      throw new RangeError(
        'Money allocation ratios must sum to a positive value',
      );
    }
    const isNegative = this.amountMinor < 0;
    const absoluteAmount = Math.abs(this.amountMinor);
    const shares = ratios.map((ratio) =>
      Math.floor((absoluteAmount * ratio) / totalRatio),
    );
    let remainder =
      absoluteAmount - shares.reduce((sum, share) => sum + share, 0);
    for (let index = 0; remainder > 0; index = (index + 1) % shares.length) {
      shares[index] += 1;
      remainder -= 1;
    }
    return shares.map((share) =>
      Money.of(
        isNegative ? -share : share,
        this.currencyCode,
        this.minorUnitDigits,
      ),
    );
  }

  /** Renders the amount as a fixed-point decimal string, e.g. `"19.99"`. */
  public toDecimalString(): string {
    if (this.minorUnitDigits === 0) {
      return String(this.amountMinor);
    }
    const negative = this.amountMinor < 0;
    const absolute = Math.abs(this.amountMinor)
      .toString()
      .padStart(this.minorUnitDigits + 1, '0');
    const whole = absolute.slice(0, absolute.length - this.minorUnitDigits);
    const fraction = absolute.slice(absolute.length - this.minorUnitDigits);
    return `${negative ? '-' : ''}${whole}.${fraction}`;
  }

  public toString(): string {
    return `${this.currencyCode} ${this.toDecimalString()}`;
  }

  public toJSON(): { readonly amount: number; readonly currency: string } {
    return { amount: this.amountMinor, currency: this.currencyCode };
  }

  private assertSameCurrency(other: Money): void {
    if (this.currencyCode !== other.currencyCode) {
      throw new RangeError(
        `Cannot combine different currencies: ${this.currencyCode} vs ${other.currencyCode}`,
      );
    }
  }
}
