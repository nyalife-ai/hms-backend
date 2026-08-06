import {
  isValidE164Phone,
  isValidEmail,
  isValidJson,
  isValidUrl,
  isValidUuid,
  safeJsonParse,
  validatePassword,
} from '..';

describe('generic validators', () => {
  it('validates email, UUID, phone, and URL inputs', () => {
    expect(isValidEmail('name@example.com')).toBe(true);
    expect(isValidEmail('x'.repeat(250) + '@x.co')).toBe(false);
    expect(isValidEmail('bad')).toBe(false);
    expect(isValidEmail(null)).toBe(false);
    expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isValidUuid(1)).toBe(false);
    expect(isValidUuid('bad')).toBe(false);
    expect(isValidE164Phone('+1234567890')).toBe(true);
    expect(isValidE164Phone('0123')).toBe(false);
    expect(isValidE164Phone(undefined)).toBe(false);
    expect(isValidUrl('https://example.com/path')).toBe(true);
    expect(isValidUrl('ftp://example.com')).toBe(false);
    expect(isValidUrl('https:///')).toBe(false);
    expect(isValidUrl(1)).toBe(false);
  });

  it('scores password strength with actionable failures', () => {
    expect(validatePassword('Strong1!')).toEqual({
      valid: true,
      score: 5,
      failures: [],
    });
    expect(validatePassword('weak')).toEqual({
      valid: false,
      score: 1,
      failures: ['length', 'uppercase', 'digit', 'symbol'],
    });
    expect(validatePassword(null, 1)).toEqual({
      valid: false,
      score: 0,
      failures: ['length', 'uppercase', 'lowercase', 'digit', 'symbol'],
    });
  });

  it('parses JSON without throwing', () => {
    expect(safeJsonParse<{ a: number }>('{"a":1}')).toEqual({
      success: true,
      value: { a: 1 },
    });
    const failed = safeJsonParse('{');
    expect(failed.success).toBe(false);
    expect(isValidJson('null')).toBe(true);
    expect(isValidJson('{')).toBe(false);
    expect(isValidJson(null)).toBe(false);
    const spy = jest.spyOn(JSON, 'parse').mockImplementationOnce(() => {
      throw new Error('unexpected');
    });
    const unexpected = safeJsonParse('x');
    expect(unexpected.success).toBe(false);
    if (!unexpected.success) {
      expect(unexpected.error).toBeInstanceOf(Error);
    }
    spy.mockRestore();
  });
});
