import {
  datasourceUrlWithPool,
  isDbPoolExhaustedError,
} from '../prisma-datasource-url';

describe('datasourceUrlWithPool', () => {
  it('caps Supabase session pooler connection_limit at 3', () => {
    const raw =
      'postgresql://u:p@aws-0-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=require&connection_limit=15';
    const out = new URL(datasourceUrlWithPool(raw)!);
    expect(out.searchParams.get('connection_limit')).toBe('3');
    expect(out.searchParams.get('pool_timeout')).toBe('30');
  });

  it('defaults session pooler to connection_limit=3 when unset', () => {
    const raw =
      'postgresql://u:p@aws-0-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=require';
    const out = new URL(datasourceUrlWithPool(raw)!);
    expect(out.searchParams.get('connection_limit')).toBe('3');
  });

  it('forces transaction pooler to connection_limit=1 + pgbouncer', () => {
    const raw =
      'postgresql://u:p@aws-0-eu-west-2.pooler.supabase.com:6543/postgres?connection_limit=10';
    const out = new URL(datasourceUrlWithPool(raw)!);
    expect(out.searchParams.get('connection_limit')).toBe('1');
    expect(out.searchParams.get('pgbouncer')).toBe('true');
  });

  it('defaults local/direct URLs to connection_limit=5', () => {
    const raw = 'postgresql://postgres:pass@localhost:5432/postgres';
    const out = new URL(datasourceUrlWithPool(raw)!);
    expect(out.searchParams.get('connection_limit')).toBe('5');
  });
});

describe('isDbPoolExhaustedError', () => {
  it('detects EMAXCONNSESSION', () => {
    expect(
      isDbPoolExhaustedError(
        new Error(
          'FATAL: (EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15',
        ),
      ),
    ).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isDbPoolExhaustedError(new Error('Claim not found'))).toBe(false);
  });
});
