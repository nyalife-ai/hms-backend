import { Money } from '../money';

describe('Money', () => {
  it('creates values from minor units and validates invariants', () => {
    const money = Money.of(1999, 'USD');
    expect(money.amount).toBe(1999);
    expect(money.currency).toBe('USD');
    expect(Money.zero('EUR').amount).toBe(0);

    expect(() => Money.of(1.5, 'USD')).toThrow(TypeError);
    expect(() => Money.of(1, 'usd')).toThrow(TypeError);
    expect(() => Money.of(1, 'US')).toThrow(TypeError);
    expect(() => Money.of(1, 'USD', -1)).toThrow(RangeError);
    expect(() => Money.of(1, 'USD', 1.5)).toThrow(RangeError);
  });

  it('parses decimal strings into minor units', () => {
    expect(Money.fromDecimalString('19.99', 'USD').amount).toBe(1999);
    expect(Money.fromDecimalString('-19.99', 'USD').amount).toBe(-1999);
    expect(Money.fromDecimalString('20', 'USD').amount).toBe(2000);
    expect(Money.fromDecimalString('1.5', 'USD').amount).toBe(150);
    expect(Money.fromDecimalString('100', 'JPY', 0).amount).toBe(100);

    expect(() => Money.fromDecimalString('abc', 'USD')).toThrow(TypeError);
    expect(() => Money.fromDecimalString('1.999', 'USD')).toThrow(RangeError);
  });

  it('adds and subtracts amounts in the same currency', () => {
    const a = Money.of(500, 'USD');
    const b = Money.of(250, 'USD');
    expect(a.add(b).amount).toBe(750);
    expect(a.subtract(b).amount).toBe(250);
    expect(() => a.add(Money.of(1, 'EUR'))).toThrow(RangeError);
    expect(() => a.subtract(Money.of(1, 'EUR'))).toThrow(RangeError);
  });

  it('multiplies and negates amounts', () => {
    const money = Money.of(300, 'USD');
    expect(money.multiply(2).amount).toBe(600);
    expect(money.multiply(1.5).amount).toBe(450);
    expect(money.negate().amount).toBe(-300);
    expect(() => money.multiply(Number.NaN)).toThrow(TypeError);
  });

  it('reports sign predicates', () => {
    expect(Money.of(0, 'USD').isZero()).toBe(true);
    expect(Money.of(1, 'USD').isPositive()).toBe(true);
    expect(Money.of(-1, 'USD').isNegative()).toBe(true);
    expect(Money.of(1, 'USD').isZero()).toBe(false);
    expect(Money.of(-1, 'USD').isPositive()).toBe(false);
    expect(Money.of(1, 'USD').isNegative()).toBe(false);
  });

  it('compares equality and ordering', () => {
    const a = Money.of(500, 'USD');
    const b = Money.of(500, 'USD');
    const c = Money.of(600, 'USD');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
    expect(a.equals(Money.of(500, 'EUR'))).toBe(false);
    expect(a.compareTo(b)).toBe(0);
    expect(a.compareTo(c)).toBe(-1);
    expect(c.compareTo(a)).toBe(1);
    expect(() => a.compareTo(Money.of(1, 'EUR'))).toThrow(RangeError);
  });

  it('allocates amounts proportionally without losing minor units', () => {
    const total = Money.of(100, 'USD');
    const shares = total.allocate([1, 1, 1]);
    expect(shares.map((share) => share.amount)).toEqual([34, 33, 33]);
    expect(shares.reduce((sum, share) => sum + share.amount, 0)).toBe(100);

    const even = Money.of(100, 'USD').allocate([1, 1]);
    expect(even.map((share) => share.amount)).toEqual([50, 50]);

    const weighted = Money.of(100, 'USD').allocate([2, 1]);
    expect(weighted.map((share) => share.amount)).toEqual([67, 33]);

    const negative = Money.of(-100, 'USD').allocate([1, 1, 1]);
    expect(negative.map((share) => share.amount)).toEqual([-34, -33, -33]);
  });

  it('rejects invalid allocation ratios', () => {
    const money = Money.of(100, 'USD');
    expect(() => money.allocate([])).toThrow(RangeError);
    expect(() => money.allocate([-1, 1])).toThrow(RangeError);
    expect(() => money.allocate([Number.NaN, 1])).toThrow(RangeError);
    expect(() => money.allocate([0, 0])).toThrow(RangeError);
  });

  it('formats decimal strings and JSON', () => {
    expect(Money.of(1999, 'USD').toDecimalString()).toBe('19.99');
    expect(Money.of(-1999, 'USD').toDecimalString()).toBe('-19.99');
    expect(Money.of(5, 'USD').toDecimalString()).toBe('0.05');
    expect(Money.of(100, 'JPY', 0).toDecimalString()).toBe('100');
    expect(Money.of(1999, 'USD').toString()).toBe('USD 19.99');
    expect(Money.of(1999, 'USD').toJSON()).toEqual({
      amount: 1999,
      currency: 'USD',
    });
  });
});
