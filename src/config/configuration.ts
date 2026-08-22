import { IConfig } from './interfaces/config.interface';

/**
 * Configuration factory.
 * Maps environment variables onto the strict {@link IConfig} interface and
 * supplies safe local-development defaults where appropriate.
 */
export default (): IConfig => ({
  app: {
    port: parseInt(process.env.PORT || '3000', 10),
    environment: process.env.NODE_ENV || 'development',
    apiUrl: process.env.PUBLIC_URL || 'http://localhost:3000',
    name: process.env.APP_NAME || 'api',
    corsOrigins: process.env.CORS_ORIGINS?.split(',')
      .map((o) => o.trim())
      .filter(Boolean) || [
      'http://localhost:3000',
      'http://localhost:3001',
    ],
    globalPrefix: process.env.API_GLOBAL_PREFIX || '',
  },
  database: {
    type: process.env.DB_TYPE || process.env.DATABASE_TYPE || 'postgres',
    host: process.env.DB_HOST || process.env.DATABASE_HOST || 'localhost',
    port: parseInt(
      process.env.DB_PORT || process.env.DATABASE_PORT || '5432',
      10,
    ),
    username:
      process.env.DB_USERNAME ||
      process.env.DATABASE_USER ||
      process.env.DATABASE_USERNAME ||
      process.env.DB_USER ||
      'postgres',
    password: process.env.DB_PASSWORD || process.env.DATABASE_PASSWORD || '',
    name: process.env.DB_NAME || process.env.DATABASE_NAME || 'app_db',
    url: process.env.DATABASE_URL || undefined,
    synchronize: process.env.DB_SYNC === 'true',
  },
  orm: {
    type:
      ((process.env.ORM_PROVIDER || process.env.ORM_TYPE) as
        'prisma' | 'typeorm') || 'prisma',
  },
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password:
      process.env.REDIS_PASSWORD && process.env.REDIS_PASSWORD.trim().length > 0
        ? process.env.REDIS_PASSWORD.trim()
        : undefined,
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'default-dev-secret-change-in-production',
    expiration: process.env.JWT_EXPIRATION || '15m',
  },
  encryption: {
    secretKey:
      process.env.ENCRYPTION_SECRET_KEY || 'default-dev-encryption-key-32ch!',
  },
  externalService: {
    apiKey: process.env.EXTERNAL_SERVICE_API_KEY || '',
    apiSecret: process.env.EXTERNAL_SERVICE_API_SECRET || '',
    baseUrl: process.env.EXTERNAL_SERVICE_BASE_URL || '',
    callbackUrl: process.env.EXTERNAL_SERVICE_CALLBACK_URL || '',
  },
  push: {
    projectId: process.env.PUSH_PROVIDER_PROJECT_ID || '',
    clientEmail: process.env.PUSH_PROVIDER_CLIENT_EMAIL || '',
    privateKey: (process.env.PUSH_PROVIDER_PRIVATE_KEY || '').replace(
      /\\n/g,
      '\n',
    ),
  },
  email: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'noreply@example.com',
  },
  storage: {
    provider: process.env.STORAGE_PROVIDER || 's3',
    bucket: process.env.STORAGE_BUCKET || 'app-documents',
    endpoint: process.env.STORAGE_ENDPOINT || undefined,
    accessKey: process.env.STORAGE_ACCESS_KEY || undefined,
    secretKey: process.env.STORAGE_SECRET_KEY || undefined,
  },
  observability: {
    logLevel:
      process.env.LOG_LEVEL ||
      (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    elasticsearch: {
      url: process.env.ELASTICSEARCH_URL || '',
      username: process.env.ELASTICSEARCH_USERNAME || 'elastic',
      password: process.env.ELASTICSEARCH_PASSWORD || '',
    },
    logstash: {
      host: process.env.LOGSTASH_HOST || '',
      port: parseInt(process.env.LOGSTASH_PORT || '5000', 10),
    },
    metricsToken: process.env.METRICS_TOKEN || '',
    sentryDsn: process.env.SENTRY_DSN || undefined,
  },
});
