import { validate } from '../env.validation';

/**
 * Unit Tests for Environment Validation.
 *
 * Ensures that the application fails fast on startup if critical
 * environment variables are missing or malformed.
 */
describe('Environment Validation', () => {
  const validConfig = {
    NODE_ENV: 'development',
    PORT: 3000,
    DB_TYPE: 'postgres',
    DB_HOST: 'localhost',
    DB_PORT: 5432,
    DB_USERNAME: 'postgres',
    DB_PASSWORD: 'password',
    DB_NAME: 'test_db',
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6379,
    JWT_SECRET: 'super-secret-key-12345678901234567890123456789012',
    JWT_EXPIRATION: '1d',
    ENCRYPTION_SECRET_KEY: 'abcdefghijklmnopqrstuvwxyz123456',
    ORM_TYPE: 'prisma',
  };

  it('should pass validation with a complete and valid configuration', () => {
    expect(() => validate(validConfig)).not.toThrow();
  });

  it('should implicitly convert string numbers to actual numbers', () => {
    const configWithStrings = {
      ...validConfig,
      PORT: '8080',
      DB_PORT: '3306',
      REDIS_PORT: '6379',
    };

    const result = validate(configWithStrings);

    expect(result.PORT).toBe(8080);
    expect(result.DB_PORT).toBe(3306);
    expect(result.REDIS_PORT).toBe(6379);
  });

  it('should throw an error if NODE_ENV is invalid', () => {
    const invalidConfig = { ...validConfig, NODE_ENV: 'staging' };

    expect(() => validate(invalidConfig)).toThrow(/NODE_ENV/);
  });

  it('should throw an error if required DB fields are missing', () => {
    const {
      DB_HOST: _DB_HOST,
      DB_USERNAME: _DB_USERNAME,
      ...missingDbConfig
    } = validConfig;

    expect(() => validate(missingDbConfig)).toThrow();
  });

  it('should throw an error if JWT_SECRET is missing', () => {
    const { JWT_SECRET: _JWT_SECRET, ...missingJwtConfig } = validConfig;

    expect(() => validate(missingJwtConfig)).toThrow(/JWT_SECRET/);
  });

  it('should throw an error if ENCRYPTION_SECRET_KEY is missing', () => {
    const {
      ENCRYPTION_SECRET_KEY: _ENCRYPTION_SECRET_KEY,
      ...missingEncConfig
    } = validConfig;

    expect(() => validate(missingEncConfig)).toThrow(/ENCRYPTION_SECRET_KEY/);
  });

  it('should accept DATABASE_* and ORM_PROVIDER aliases', () => {
    const aliased = {
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_HOST: 'db.internal',
      DATABASE_PORT: 5432,
      DATABASE_USER: 'app',
      DATABASE_PASSWORD: 'password',
      DATABASE_NAME: 'app_db',
      ORM_PROVIDER: 'prisma',
      REDIS_HOST: 'localhost',
      REDIS_PORT: 6379,
      JWT_SECRET: 'super-secret-key-12345678901234567890123456789012',
      JWT_EXPIRATION: '1d',
      ENCRYPTION_SECRET_KEY: 'abcdefghijklmnopqrstuvwxyz123456',
    };

    const result = validate(aliased);
    expect(result.DB_HOST).toBe('db.internal');
    expect(result.DB_USERNAME).toBe('app');
    expect(result.ORM_TYPE).toBe('prisma');
  });
});
