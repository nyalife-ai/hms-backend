import {
  maskCardNumber,
  maskEmailAddress,
  maskFields,
  maskPhoneNumber,
  maskValue,
} from '../data-masking';

describe('data masking', () => {
  it('masks email local parts while preserving the domain', () => {
    expect(maskEmailAddress('john.doe@example.com')).toBe(
      '******oe@example.com',
    );
    expect(maskEmailAddress('a@example.com', 4)).toBe('*@example.com');
  });

  it('falls back to plain masking for malformed emails', () => {
    expect(maskEmailAddress('not-an-email')).toBe('**********il');
    expect(maskEmailAddress('@example.com')).toBe('**********om');
  });

  it('masks phone numbers preserving a leading plus sign', () => {
    expect(maskPhoneNumber('+15551234567')).toBe('+*********67');
    expect(maskPhoneNumber('5551234567', 4)).toBe('******4567');
  });

  it('masks card numbers to their last four digits', () => {
    expect(maskCardNumber('4111 1111 1111 1234')).toBe('************1234');
    expect(maskCardNumber('1234')).toBe('****');
    expect(maskCardNumber('12')).toBe('**');
  });

  it('masks generic strings, fully masking short values', () => {
    expect(maskValue('secret-token', 4)).toBe('********oken');
    expect(maskValue('abc', 4)).toBe('***');
    expect(maskValue('abcd', 4)).toBe('****');
    expect(maskValue('x', 2, '#')).toBe('#');
  });

  it('masks configured fields on a record using default PII maskers', () => {
    const record = {
      email: 'john.doe@example.com',
      phone: '+15551234567',
      card: '4111111111111234',
      name: 'John Doe',
      age: 30,
    };
    const masked = maskFields(record, ['email', 'phone', 'card', 'age']);
    expect(masked.email).toBe('******oe@example.com');
    expect(masked.phone).toBe('+*********67');
    expect(masked.card).toBe('************1234');
    expect(masked.age).toBe(30);
    expect(masked.name).toBe('John Doe');
    expect(record.email).toBe('john.doe@example.com');
  });

  it('masks generic fields and unknown fields with the fallback masker', () => {
    const record = { ssn: '123-45-6789', notes: 'internal' };
    const masked = maskFields(record, ['ssn', 'notes'], {
      genericFields: ['notes'],
    });
    expect(masked.ssn).toBe('*******6789');
    expect(masked.notes).toBe(maskValue('internal'));
  });

  it('uses custom maskers when supplied', () => {
    const record = { code: 'ABCDEFG' };
    const masked = maskFields(record, ['code'], {
      maskers: { code: (value) => value.toUpperCase() },
    });
    expect(masked.code).toBe('ABCDEFG');
  });
});
