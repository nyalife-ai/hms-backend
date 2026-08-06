import {
  excludeFields,
  redactSecrets,
  safeParse,
  safeStringify,
  toPlainObject,
  transformDeep,
} from '..';

describe('JSON serializer', () => {
  it('serializes special values and cycles safely', () => {
    const value: Record<string, unknown> = {
      bigint: 12n,
      date: new Date('2024-01-01T00:00:00.000Z'),
      invalidDate: new Date('bad'),
      missing: undefined,
      array: [undefined, 1],
    };
    value.self = value;
    expect(safeStringify(value, 2)).toContain('"bigint": "12"');
    expect(safeStringify(value)).toContain('"self":"[Circular]"');
    expect(safeStringify(value)).not.toContain('missing');
    expect(safeStringify(undefined)).toBeUndefined();
    const broken = new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error('broken');
        },
      },
    );
    expect(safeStringify(broken)).toBeUndefined();
  });

  it('parses and optionally revives ISO dates', () => {
    const parsed = safeParse<{ readonly at: Date; readonly text: string }>(
      '{"at":"2024-01-01T00:00:00.000Z","text":"x"}',
    );
    expect(parsed?.at).toBeInstanceOf(Date);
    const plain = safeParse<{ readonly at: string }>(
      '{"at":"2024-01-01T00:00:00.000Z"}',
      false,
    );
    expect(typeof plain?.at).toBe('string');
    expect(safeParse('{')).toBeUndefined();
  });
});

describe('object serializer', () => {
  it('deeply transforms arrays, objects, dates, and cycles', () => {
    const source: Record<string, unknown> = {
      number: 1,
      date: new Date(1),
      array: [{ value: 2 }],
    };
    source.self = source;
    const transformed = transformDeep(source, (value) =>
      typeof value === 'number' ? value * 2 : value,
    ) as Record<string, unknown>;
    expect(transformed.number).toBe(2);
    expect(transformed.date).toBe(source.date);
    expect(
      (transformed.array as readonly Record<string, unknown>[])[0].value,
    ).toBe(4);
    expect(transformed.self).toBe(transformed);
  });

  it('redacts secret fields case-insensitively at every depth', () => {
    const source = {
      password: 'never-leak',
      nested: { APIKEY: 'also-secret', safe: 'yes' },
    };
    expect(redactSecrets(source)).toEqual({
      password: '[REDACTED]',
      nested: { APIKEY: '[REDACTED]', safe: 'yes' },
    });
    expect(excludeFields({ token: 'x', safe: 'y' }, ['token'])).toEqual({
      token: '[REDACTED]',
      safe: 'y',
    });
  });

  it('converts enumerable own properties to a plain object', () => {
    class Example {
      public readonly visible = 1;
    }
    const result = toPlainObject(new Example());
    expect(result).toEqual({ visible: 1 });
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  });
});
