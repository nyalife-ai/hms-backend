import { generateId } from '../generate-id';

describe('generateId', () => {
  it('always prefixes the injected randomUUID', () => {
    const id = generateId('evt', {
      randomUUID: () => '11111111-2222-3333-4444-555555555555',
    });
    expect(id).toBe('evt_11111111-2222-3333-4444-555555555555');
  });

  it('uses resolveCrypto when the second argument is omitted or undefined', () => {
    const omitted = generateId('app');
    const explicitUndefined = generateId('cmd', undefined);
    expect(omitted).toMatch(
      /^app_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(explicitUndefined).toMatch(
      /^cmd_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('falls back to getRandomValues when randomUUID is absent', () => {
    const id = generateId('qry', {
      getRandomValues: (array) => {
        for (let i = 0; i < array.length; i += 1) {
          array[i] = i;
        }
        return array;
      },
    });
    expect(id).toMatch(
      /^qry_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('fails closed when no CSPRNG is available', () => {
    expect(() => generateId('x', {})).toThrow(/No CSPRNG available/);
  });
});
