/**
 * Global Application Configuration Interface.
 *
 * Defines the typed shape of environment configuration so NestJS services
 * receive compile-time safety instead of untyped `process.env` access.
 * Domain-specific integrations belong in feature modules, not here.
 */
export interface IConfig {
  app: {
    port: number;
    environment: string;
    apiUrl: string;
    name: string;
    corsOrigins: string[];
    globalPrefix: string;
  };

  database: {
    type: string;
    host: string;
    port: number;
    username: string;
    password: string;
    name: string;
    /** Prisma connection string (required when ORM_TYPE=prisma). */
    url?: string;
    synchronize: boolean;
  };

  orm: {
    type: 'prisma' | 'typeorm';
  };

  redis: {
    host: string;
    port: number;
    password?: string;
  };

  jwt: {
    secret: string;
    /** Access token TTL (e.g. 15m). Refresh TTL uses JWT_REFRESH_DAYS. */
    expiration: string;
  };

  encryption: {
    secretKey: string;
  };

  /**
   * Optional generic external API credentials.
   * Add provider-specific blocks in feature modules as needed.
   */
  externalService: {
    apiKey: string;
    apiSecret: string;
    baseUrl: string;
    callbackUrl: string;
  };

  /**
   * Optional push-notification provider credentials (Firebase, OneSignal, etc.).
   */
  push: {
    projectId: string;
    clientEmail: string;
    privateKey: string;
  };

  email: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    from: string;
  };

  storage: {
    provider: string;
    bucket: string;
    endpoint?: string;
    accessKey?: string;
    secretKey?: string;
  };

  observability: {
    logLevel: string;
    elasticsearch: {
      url: string;
      username: string;
      password: string;
    };
    logstash: {
      host: string;
      port: number;
    };
    metricsToken: string;
    sentryDsn?: string;
  };
}
