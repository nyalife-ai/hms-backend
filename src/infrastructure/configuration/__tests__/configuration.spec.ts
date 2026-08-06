import {
  InfrastructureConfigService,
  maskConnectionUrl,
  maskError,
  maskSecrets,
} from '..';
import { ConfigValidator } from '../../../platform/configuration';

describe('infrastructure configuration', () => {
  it('loads defaults, ORM_TYPE fallback, numbers, and getters', () => {
    expect(new InfrastructureConfigService().environment).toBe('development');
    const config = new InfrastructureConfigService({
      ORM_TYPE: 'typeorm',
      DATABASE_PORT: '3306',
    });
    expect(config.environment).toBe('development');
    expect(config.get('ORM_PROVIDER')).toBe('typeorm');
    expect(config.get('DATABASE_PORT')).toBe(3306);
    expect(config.snapshot()).toEqual(
      expect.objectContaining({ NODE_ENV: 'development' }),
    );
    expect(() => config.getOrThrow('DATABASE_URL')).toThrow(
      'Missing infrastructure configuration',
    );
    expect(
      new InfrastructureConfigService(
        { NODE_ENV: 'test' },
        new ConfigValidator(),
      ).environment,
    ).toBe('development');
  });

  it('aliases DB_* into DATABASE_* and prefers explicit DATABASE_*', () => {
    const aliased = new InfrastructureConfigService({
      DB_HOST: 'alias-host',
      DB_PORT: '3307',
      DB_USERNAME: 'alias-user',
      DB_PASSWORD: 'alias-password',
      DB_NAME: 'alias-db',
    });
    expect(aliased.snapshot()).toEqual(
      expect.objectContaining({
        DATABASE_HOST: 'alias-host',
        DATABASE_PORT: 3307,
        DATABASE_USER: 'alias-user',
        DATABASE_PASSWORD: 'alias-password',
        DATABASE_NAME: 'alias-db',
      }),
    );

    const fromDbUser = new InfrastructureConfigService({
      DB_USER: 'legacy-user',
    });
    expect(fromDbUser.get('DATABASE_USER')).toBe('legacy-user');

    const preferred = new InfrastructureConfigService({
      DATABASE_HOST: 'preferred-host',
      DB_HOST: 'ignored-host',
      DATABASE_PORT: '5433',
      DB_PORT: '3306',
      DATABASE_USER: 'preferred-user',
      DB_USERNAME: 'ignored-user',
      DATABASE_PASSWORD: 'preferred-password',
      DB_PASSWORD: 'ignored-password',
      DATABASE_NAME: 'preferred-db',
      DB_NAME: 'ignored-db',
    });
    expect(preferred.snapshot()).toEqual(
      expect.objectContaining({
        DATABASE_HOST: 'preferred-host',
        DATABASE_PORT: 5433,
        DATABASE_USER: 'preferred-user',
        DATABASE_PASSWORD: 'preferred-password',
        DATABASE_NAME: 'preferred-db',
      }),
    );
  });

  it('builds REDIS_URL from host/port/password when REDIS_URL is absent', () => {
    const withPassword = new InfrastructureConfigService({
      REDIS_HOST: 'redis.internal',
      REDIS_PORT: '6380',
      REDIS_PASSWORD: 'p@ss word',
    });
    expect(withPassword.get('REDIS_URL')).toBe(
      `redis://:${encodeURIComponent('p@ss word')}@redis.internal:6380`,
    );

    const withoutPassword = new InfrastructureConfigService({
      REDIS_HOST: 'localhost',
    });
    expect(withoutPassword.get('REDIS_URL')).toBe('redis://localhost:6379');

    const explicit = new InfrastructureConfigService({
      REDIS_URL: 'redis://explicit:6379/1',
      REDIS_HOST: 'ignored',
      REDIS_PORT: '1',
      REDIS_PASSWORD: 'ignored',
    });
    expect(explicit.get('REDIS_URL')).toBe('redis://explicit:6379/1');

    const emptyPassword = new InfrastructureConfigService({
      REDIS_HOST: 'cache',
      REDIS_PASSWORD: '',
    });
    expect(emptyPassword.get('REDIS_URL')).toBe('redis://cache:6379');

    expect(
      new InfrastructureConfigService({ REDIS_HOST: '' }).get('REDIS_URL'),
    ).toBeUndefined();
  });

  it('rejects invalid values through the platform validator', () => {
    expect(
      () =>
        new InfrastructureConfigService({
          NODE_ENV: 'space',
          DATABASE_PORT: '0',
          REDIS_URL: 'not a url',
        }),
    ).toThrow('Configuration validation failed');
  });

  it('fails fast for incomplete and weak production database settings', () => {
    expect(
      () => new InfrastructureConfigService({ NODE_ENV: 'production' }),
    ).toThrow('Missing infrastructure configuration');
    expect(
      () =>
        new InfrastructureConfigService({
          NODE_ENV: 'production',
          ORM_PROVIDER: 'typeorm',
          DATABASE_HOST: 'host',
          DATABASE_NAME: 'db',
          DATABASE_USER: 'user',
          DATABASE_PASSWORD: 'weak',
        }),
    ).toThrow('at least 12');
    expect(
      () =>
        new InfrastructureConfigService({
          NODE_ENV: 'production',
          DATABASE_URL: 'postgres://user:weak@host/db',
        }),
    ).toThrow('at least 12');
  });

  it('accepts safe production settings and masks serialization', () => {
    const config = new InfrastructureConfigService({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://user:very-long-password@host/db',
      EXTERNAL_API_TOKEN: 'private',
    });
    const serialized = JSON.stringify(config);
    expect(serialized).not.toContain('very-long-password');
    expect(serialized).not.toContain('private');
    expect(serialized).toContain('[REDACTED]');

    const typeOrmUrl = new InfrastructureConfigService({
      NODE_ENV: 'production',
      ORM_PROVIDER: 'typeorm',
      DATABASE_URL: 'postgres://user:very-long-password@host/db',
    });
    expect(typeOrmUrl.get('ORM_PROVIDER')).toBe('typeorm');
    expect(typeOrmUrl.get('DATABASE_URL')).toContain('very-long-password');
  });

  it('masks URLs, secret keys, errors, arrays, and circular values', () => {
    expect(maskConnectionUrl('postgres://user:secret@host/db')).not.toContain(
      'secret',
    );
    expect(maskConnectionUrl('password=secret other')).toBe(
      'password=[REDACTED] other',
    );
    expect(maskConnectionUrl('ordinary text')).toBe('ordinary text');
    expect(maskConnectionUrl('postgres://user@host/db')).toContain(
      'postgres://user@host/db',
    );
    expect(maskError(new Error('token=hidden'))).not.toContain('hidden');
    expect(maskError('password=hidden')).not.toContain('hidden');
    const circular: Record<string, unknown> = { apiKey: 'secret', safe: 1 };
    circular.self = circular;
    const circularArray: unknown[] = [];
    circularArray.push(circularArray);
    const masked = maskSecrets({
      nested: circular,
      list: [circular, 'postgres://u:p@host/db'],
      circularArray,
      nil: null,
    });
    expect(masked.nested.apiKey).toBe('[REDACTED]');
    expect(masked.nested.self).toBe('[Circular]');
    expect(masked.list[0]).toBe('[Circular]');
    expect(masked.list[1]).not.toContain(':p@');
    expect(masked.circularArray[0]).toBe('[Circular]');
    expect(masked.nil).toBeNull();
  });
});
