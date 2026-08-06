import configuration from '../configuration';

/**
 * Unit Tests for Configuration Factory.
 *
 * Verifies that process.env variables are correctly parsed,
 * type-converted, and fall back to sensible defaults when missing.
 */
describe('Configuration Factory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return default values when no environment variables are set', () => {
    process.env = {};

    const config = configuration();

    expect(config.app.port).toBe(3000);
    expect(config.app.environment).toBe('development');
    expect(config.app.name).toBe('api');
    expect(config.database.type).toBe('postgres');
    expect(config.database.port).toBe(5432);
    expect(config.database.name).toBe('app_db');
    expect(config.orm.type).toBe('prisma');
    expect(config.observability.logLevel).toBe('debug');
  });

  it('should correctly parse and map provided environment variables', () => {
    process.env = {
      PORT: '8080',
      NODE_ENV: 'production',
      APP_NAME: 'orders-api',
      DB_TYPE: 'mysql',
      DB_PORT: '3306',
      REDIS_PORT: '6380',
      SMTP_PORT: '465',
      LOGSTASH_PORT: '5044',
      EXTERNAL_SERVICE_API_KEY: 'key',
      PUSH_PROVIDER_PROJECT_ID: 'proj-1',
    };

    const config = configuration();

    expect(config.app.port).toBe(8080);
    expect(config.app.environment).toBe('production');
    expect(config.app.name).toBe('orders-api');
    expect(config.database.type).toBe('mysql');
    expect(config.database.port).toBe(3306);
    expect(config.redis.port).toBe(6380);
    expect(config.email.port).toBe(465);
    expect(config.observability.logstash.port).toBe(5044);
    expect(config.externalService.apiKey).toBe('key');
    expect(config.push.projectId).toBe('proj-1');
  });

  it('should correctly split CORS_ORIGINS into an array', () => {
    process.env.CORS_ORIGINS = 'http://localhost:3000, https://app.example.com';

    const config = configuration();

    expect(config.app.corsOrigins).toEqual([
      'http://localhost:3000',
      'https://app.example.com',
    ]);
  });

  it('should replace literal \\n with actual newlines in PUSH_PROVIDER_PRIVATE_KEY', () => {
    process.env.PUSH_PROVIDER_PRIVATE_KEY =
      '-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC\\n-----END PRIVATE KEY-----\\n';

    const config = configuration();

    expect(config.push.privateKey).toContain('\n');
    expect(config.push.privateKey).not.toContain('\\n');
  });

  it('should set production log level by default if NODE_ENV is production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.LOG_LEVEL;

    const config = configuration();

    expect(config.observability.logLevel).toBe('info');
  });
});
