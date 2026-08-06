import {
  BaseApplicationException,
  DomainException,
  ValidationException,
  NotFoundException,
  ConflictException,
  BusinessRuleException,
} from '../index';

describe('BaseApplicationException hierarchy', () => {
  it('stores code, metadata, timestamp, and serializes', () => {
    const error = new DomainException('broken', 'CUSTOM_DOMAIN', {
      field: 'name',
    });
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(BaseApplicationException);
    expect(error).toBeInstanceOf(DomainException);
    expect(error.code).toBe('CUSTOM_DOMAIN');
    expect(error.message).toBe('broken');
    expect(error.metadata).toEqual({ field: 'name' });
    expect(error.timestamp).toBeInstanceOf(Date);
    expect(error.toJSON()).toEqual(
      expect.objectContaining({
        name: 'DomainException',
        code: 'CUSTOM_DOMAIN',
        message: 'broken',
        metadata: { field: 'name' },
      }),
    );
  });

  it('preserves cause', () => {
    const cause = new Error('root');
    const error = new DomainException('wrap', 'DOMAIN_ERROR', undefined, cause);
    expect(error.cause).toBe(cause);
  });

  it('uses default domain code', () => {
    expect(new DomainException('x').code).toBe('DOMAIN_ERROR');
  });
});

describe('ValidationException', () => {
  it('captures field errors', () => {
    const error = new ValidationException('invalid', [
      { field: 'email', message: 'required' },
      { field: 'age', message: 'min' },
    ]);
    expect(error.fieldErrors).toHaveLength(2);
    expect(error.metadata.fieldErrorCount).toBe(2);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.toJSON()).toEqual(
      expect.objectContaining({
        fieldErrors: [
          { field: 'email', message: 'required' },
          { field: 'age', message: 'min' },
        ],
      }),
    );
    expect(Object.isFrozen(error.fieldErrors)).toBe(true);
  });

  it('defaults to empty field errors', () => {
    const error = new ValidationException('invalid');
    expect(error.fieldErrors).toEqual([]);
  });

  it('keeps fieldErrorCount authoritative over metadata', () => {
    const error = new ValidationException(
      'invalid',
      [{ field: 'x', message: 'bad' }],
      'VALIDATION_ERROR',
      { fieldErrorCount: 99 },
    );
    expect(error.metadata.fieldErrorCount).toBe(1);
  });
});

describe('NotFoundException', () => {
  it('formats message with identifier', () => {
    const error = new NotFoundException('Resource', 'abc');
    expect(error.message).toBe("Resource with id 'abc' was not found");
    expect(error.metadata).toEqual(
      expect.objectContaining({ resource: 'Resource', identifier: 'abc' }),
    );
  });

  it('formats message without identifier', () => {
    const error = new NotFoundException('Resource');
    expect(error.message).toBe('Resource was not found');
    expect(error.metadata.identifier).toBeNull();
  });

  it('stringifies numeric identifiers', () => {
    const error = new NotFoundException('Resource', 42);
    expect(error.metadata.identifier).toBe('42');
  });

  it('prevents metadata from overwriting reserved keys', () => {
    const error = new NotFoundException('User', 'id-1', 'NOT_FOUND', {
      resource: 'forged',
      identifier: 'forged',
    });
    expect(error.metadata.resource).toBe('User');
    expect(error.metadata.identifier).toBe('id-1');
  });
});

describe('ConflictException / BusinessRuleException', () => {
  it('creates conflict errors', () => {
    const error = new ConflictException('duplicate', 'DUP', { key: 'email' });
    expect(error.code).toBe('DUP');
    expect(error.metadata).toEqual({ key: 'email' });
  });

  it('creates business rule errors with rule name', () => {
    const error = new BusinessRuleException(
      'MaxItems',
      'too many items',
      'RULE_FAIL',
      { max: 10 },
    );
    expect(error.rule).toBe('MaxItems');
    expect(error.code).toBe('RULE_FAIL');
    expect(error.metadata).toEqual({ rule: 'MaxItems', max: 10 });
    expect(error.toJSON()).toEqual(
      expect.objectContaining({ rule: 'MaxItems' }),
    );
  });

  it('prevents metadata from overwriting the rule key', () => {
    const error = new BusinessRuleException('RealRule', 'msg', 'CODE', {
      rule: 'forged',
    });
    expect(error.rule).toBe('RealRule');
    expect(error.metadata.rule).toBe('RealRule');
  });

  it('uses default codes', () => {
    expect(new ConflictException('x').code).toBe('CONFLICT');
    expect(new BusinessRuleException('R', 'msg').code).toBe(
      'BUSINESS_RULE_VIOLATION',
    );
  });
});
