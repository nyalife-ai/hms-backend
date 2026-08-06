import {
  addDays,
  addMinutes,
  base64UrlDecode,
  base64UrlDecodeText,
  base64UrlEncode,
  camelCase,
  capitalize,
  chunk,
  clamp,
  compact,
  constantTimeEqual,
  deepClone,
  deepEqual,
  deepMerge,
  difference,
  differenceInMs,
  endOfDay,
  flatten,
  formatIso,
  groupBy,
  hmacSha256Hex,
  intersection,
  isAfter,
  isBefore,
  isBlank,
  isFiniteNumber,
  isPlainObject,
  isWithinRange,
  kebabCase,
  maskSecret,
  omit,
  padStartSafe,
  parseIso,
  partition,
  percentage,
  pick,
  randomHex,
  removeUndefined,
  roundTo,
  safeParseFloat,
  safeParseInt,
  sha256Hex,
  slugify,
  snakeCase,
  sortBy,
  startOfDay,
  stripHtml,
  removeBasicHtmlTags,
  sum,
  truncate,
  unflatten,
  unique,
  uniqueBy,
  zip,
} from '..';

describe('date utilities', () => {
  const date = new Date('2024-03-10T12:34:56.789Z');
  it('performs deterministic UTC date math and comparisons', () => {
    expect(addDays(date, 1).toISOString()).toBe('2024-03-11T12:34:56.789Z');
    expect(addMinutes(date, -30).toISOString()).toBe(
      '2024-03-10T12:04:56.789Z',
    );
    expect(startOfDay(date).toISOString()).toBe('2024-03-10T00:00:00.000Z');
    expect(endOfDay(date).toISOString()).toBe('2024-03-10T23:59:59.999Z');
    expect(isBefore(new Date(1), new Date(2))).toBe(true);
    expect(isAfter(new Date(2), new Date(1))).toBe(true);
    expect(differenceInMs(new Date(4), new Date(1))).toBe(3);
    expect(
      isWithinRange(new Date(2), { start: new Date(1), end: new Date(2) }),
    ).toBe(true);
    expect(
      isWithinRange(new Date(3), { start: new Date(1), end: new Date(2) }),
    ).toBe(false);
    expect(formatIso(date)).toBe('2024-03-10T12:34:56.789Z');
    expect(parseIso('2024-03-10T12:34:56.789Z')?.getTime()).toBe(
      date.getTime(),
    );
    expect(parseIso('2024-03-10')).toBeUndefined();
    expect(parseIso('bad')).toBeUndefined();
  });
  it('rejects invalid dates', () => {
    const invalid = new Date('bad');
    expect(() => addDays(invalid, 1)).toThrow(TypeError);
    expect(() => formatIso(invalid)).toThrow(TypeError);
  });
});

describe('string utilities', () => {
  it('normalizes and formats strings', () => {
    expect(capitalize('hello')).toBe('Hello');
    expect(capitalize('')).toBe('');
    expect(camelCase('Hello_world Test')).toBe('helloWorldTest');
    expect(snakeCase('helloWorld')).toBe('hello_world');
    expect(kebabCase('Hello world')).toBe('hello-world');
    expect(slugify('Crème brûlée!')).toBe('creme-brulee');
    expect(
      removeBasicHtmlTags(
        '<script>alert(1)</script><style>x</style><b>safe</b>',
      ),
    ).toBe('safe');
    // Deprecated alias — display normalization only, not XSS sanitization.
    expect(stripHtml('<b>safe</b>')).toBe('safe');
    expect(stripHtml).toBe(removeBasicHtmlTags);
    expect(padStartSafe('7', 3, '0')).toBe('007');
    expect(padStartSafe('7', 2)).toBe(' 7');
    expect(padStartSafe('7', -2, '')).toBe('7');
  });
  it('truncates, checks blanks, and never leaks secrets', () => {
    expect(truncate('short', 6)).toBe('short');
    expect(truncate('abcdef', 4)).toBe('abc…');
    expect(truncate('abcdef', 2, '...')).toBe('..');
    expect(() => truncate('x', -1)).toThrow(RangeError);
    expect(isBlank(null)).toBe(true);
    expect(isBlank(undefined)).toBe(true);
    expect(isBlank('  ')).toBe(true);
    expect(isBlank('x')).toBe(false);
    expect(maskSecret('abcdefgh', 2, 2)).toBe('ab****gh');
    expect(maskSecret('abc', 2, 2)).toBe('***');
    expect(maskSecret('abc', -1, -1)).toBe('***');
    expect(maskSecret('abc', 1, 0)).toBe('a**');
  });
});

describe('object utilities', () => {
  it('picks, omits, merges, clones and compares', () => {
    const source = {
      a: 1,
      nested: { b: 2 },
      date: new Date(1),
      array: [1, { x: 2 }],
    };
    expect(pick(source, ['a', 'missing' as keyof typeof source])).toEqual({
      a: 1,
    });
    expect(omit(source, ['a'])).not.toHaveProperty('a');
    const merged = deepMerge(source, { nested: { c: 3 }, array: [9] });
    expect(merged).toMatchObject({ nested: { b: 2, c: 3 }, array: [9] });
    expect(merged).not.toBe(source);
    expect(deepEqual(deepClone(source), source)).toBe(true);
    expect(deepEqual(new Date(1), new Date(1))).toBe(true);
    expect(deepEqual(new Date(1), new Date(2))).toBe(false);
    expect(deepEqual(null, {})).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual({ a: 1 }, Object.create({ a: 1 }))).toBe(false);
  });
  it('handles cycles and object shapes', () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const clone = deepClone(cyclic);
    expect(clone.self).toBe(clone);
    expect(deepEqual(cyclic, clone)).toBe(true);
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject(Object.prototype)).toBe(false);
  });

  it('rejects prototype-polluting merge keys and protects groupBy buckets', () => {
    expect(() =>
      deepMerge({ a: 1 }, JSON.parse('{"__proto__":{"x":1}}')),
    ).toThrow(TypeError);
    expect(() => deepMerge({}, { prototype: {} })).toThrow(TypeError);
    expect(() => deepMerge({}, { constructor: {} })).toThrow(TypeError);
    const polluted = Object.prototype as unknown as { polluted?: boolean };
    expect(polluted.polluted).toBeUndefined();

    const grouped = groupBy(
      [{ k: '__proto__' as const }, { k: 'constructor' as const }],
      (item) => item.k,
    );
    expect(Object.getPrototypeOf(grouped)).toBeNull();
    expect(grouped.__proto__).toEqual([{ k: '__proto__' }]);
    expect(grouped.constructor).toEqual([{ k: 'constructor' }]);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('clones and compares Map, Set, RegExp, and Buffer', () => {
    const map = new Map<unknown, unknown>([
      ['a', 1],
      [{ nested: true }, 2],
    ]);
    const mapClone = deepClone(map);
    expect(mapClone).not.toBe(map);
    expect(deepEqual(map, mapClone)).toBe(true);
    expect(deepEqual(map, new Map([['a', 2]]))).toBe(false);
    expect(
      deepEqual(
        new Map([['a', 1]]),
        new Map([
          ['a', 1],
          ['b', 2],
        ]),
      ),
    ).toBe(false);
    expect(deepEqual(new Map([['a', 1]]), new Map([['a', 1]]))).toBe(true);
    expect(
      deepEqual(new Map([[{ k: 1 }, 'x']]), new Map([[{ k: 2 }, 'x']])),
    ).toBe(false);

    const set = new Set([1, { a: 1 }]);
    expect(deepEqual(set, deepClone(set))).toBe(true);
    expect(deepEqual(set, new Set([1]))).toBe(false);
    expect(deepEqual(new Set([1]), new Set([2]))).toBe(false);

    expect(deepEqual(/ab/gi, deepClone(/ab/gi))).toBe(true);
    expect(deepEqual(/ab/g, /ab/i)).toBe(false);

    const buffer = Buffer.from([1, 2, 3]);
    const bufferClone = deepClone(buffer);
    expect(Buffer.isBuffer(bufferClone)).toBe(true);
    expect(deepEqual(buffer, bufferClone)).toBe(true);
    expect(deepEqual(buffer, Buffer.from([1, 2, 4]))).toBe(false);
    expect(deepEqual(new Map(), new Set())).toBe(false);
    expect(deepEqual(new Date(1), new Map())).toBe(false);
    expect(deepEqual([], {})).toBe(false);
  });

  it('flattens, unflattens, and removes undefined', () => {
    expect(flatten({ a: { b: 1 }, empty: {} })).toEqual({
      'a.b': 1,
      empty: {},
    });
    expect(flatten({ a: { b: 1 } }, '/')).toEqual({ 'a/b': 1 });
    expect(unflatten({ 'a.b': 1, 'a.c': 2 })).toEqual({ a: { b: 1, c: 2 } });
    expect(unflatten({ 'a/b': 1 }, '/')).toEqual({ a: { b: 1 } });
    expect(() => unflatten({ '__proto__.x': 1 })).toThrow(TypeError);
    expect(() => unflatten({ 'a.constructor.x': 1 })).toThrow(TypeError);
    expect(() => unflatten({ 'a.prototype.x': 1 })).toThrow(TypeError);
    expect(removeUndefined({ a: 1, b: undefined })).toEqual({ a: 1 });

    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(() => flatten(cyclic)).toThrow(TypeError);
  });
});

describe('array utilities', () => {
  it('transforms collections', () => {
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
    expect(chunk([], 2)).toEqual([]);
    expect(() => chunk([1], 0)).toThrow(RangeError);
    expect(() => chunk([1], 1.2)).toThrow(RangeError);
    expect(unique([1, 1, 2])).toEqual([1, 2]);
    expect(
      uniqueBy([{ id: 1 }, { id: 1 }, { id: 2 }], (item) => item.id),
    ).toHaveLength(2);
    expect(groupBy([1, 2, 3], (item) => (item % 2 ? 'odd' : 'even'))).toEqual({
      odd: [1, 3],
      even: [2],
    });
    expect(partition([1, 2, 3], (item) => item > 1)).toEqual([[2, 3], [1]]);
    expect(compact([0, 1, null, 2, false, '', undefined])).toEqual([1, 2]);
    expect(zip([1], ['a', 'b'])).toEqual([
      [1, 'a'],
      [undefined, 'b'],
    ]);
    expect(difference([1, 2], [2])).toEqual([1]);
    expect(intersection([1, 1, 2], [1])).toEqual([1]);
    expect(sum([1, 2, 3])).toBe(6);
  });
  it('sorts by multiple nullable keys stably', () => {
    const values = [
      { a: 1, b: 'z' },
      { a: null, b: 'x' },
      { a: 1, b: 'a' },
      { a: 2, b: 'b' },
    ];
    expect(
      sortBy(
        values,
        (v) => v.a,
        (v) => v.b,
      ).map((v) => v.b),
    ).toEqual(['x', 'a', 'z', 'b']);
    expect(sortBy([new Date(2), new Date(1)], (v) => v)[0].getTime()).toBe(1);
    expect(sortBy([undefined, null, 1], (v) => v)).toEqual([
      null,
      1,
      undefined,
    ]);
    expect(sortBy([1, 1], (v) => v)).toEqual([1, 1]);
    expect(sortBy([2, 1])).toEqual([2, 1]);
  });
});

describe('crypto and number utilities', () => {
  it('hashes, encodes, and compares securely', () => {
    expect(sha256Hex('abc')).toHaveLength(64);
    expect(hmacSha256Hex('abc', 'key')).toHaveLength(64);
    const encoded = base64UrlEncode('✓ hello');
    expect(base64UrlDecodeText(encoded)).toBe('✓ hello');
    expect(base64UrlDecode(encoded)).toBeInstanceOf(Uint8Array);
    expect(constantTimeEqual('same', 'same')).toBe(true);
    expect(constantTimeEqual('same', 'diff')).toBe(false);
    expect(constantTimeEqual('short', 'longer')).toBe(false);
    expect(constantTimeEqual(new Uint8Array([1]), new Uint8Array([1]))).toBe(
      true,
    );
    expect(randomHex(2, () => new Uint8Array([1, 255]))).toBe('01ff');
    expect(randomHex(0, () => new Uint8Array())).toBe('');
    expect(() => randomHex(-1, () => new Uint8Array())).toThrow(RangeError);
    expect(() => randomHex(2, () => new Uint8Array(1))).toThrow(RangeError);
  });
  it('handles numeric boundaries and parsing', () => {
    expect(clamp(4, 1, 3)).toBe(3);
    expect(clamp(-1, 1, 3)).toBe(1);
    expect(() => clamp(1, 2, 1)).toThrow(RangeError);
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(1.4)).toBe(1);
    expect(() => roundTo(1, 1.2)).toThrow(TypeError);
    expect(isFiniteNumber(1)).toBe(true);
    expect(isFiniteNumber(NaN)).toBe(false);
    expect(isFiniteNumber('1')).toBe(false);
    expect(safeParseInt('10')).toBe(10);
    expect(safeParseInt('+ff', 16)).toBe(255);
    expect(safeParseInt('10x')).toBeUndefined();
    expect(safeParseInt('')).toBeUndefined();
    expect(safeParseInt(1)).toBeUndefined();
    expect(safeParseInt('1', 1)).toBeUndefined();
    expect(safeParseFloat(' 1.5 ')).toBe(1.5);
    expect(safeParseFloat('')).toBeUndefined();
    expect(safeParseFloat('x')).toBeUndefined();
    expect(safeParseFloat(1)).toBeUndefined();
    expect(percentage(1, 4)).toBe(25);
    expect(percentage(1, 0)).toBeUndefined();
    expect(percentage(NaN, 1)).toBeUndefined();
    expect(percentage(1, Infinity)).toBeUndefined();
  });
});
