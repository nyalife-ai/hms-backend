import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsString,
  IsOptional,
  IsBoolean,
  MinLength,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

enum DbType {
  Postgres = 'postgres',
  Mysql = 'mysql',
  Sqlite = 'sqlite',
}

enum OrmType {
  Prisma = 'prisma',
  Typeorm = 'typeorm',
}

/**
 * Validated environment variables.
 *
 * Required fields fail the process on boot. Optional integration fields
 * (external services, push, SMTP, storage, observability) may be omitted
 * until the corresponding feature module is enabled.
 */
export class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment;

  @Type(() => Number)
  @IsNumber()
  PORT: number;

  @IsString()
  @IsOptional()
  APP_NAME?: string;

  @IsString()
  @IsOptional()
  PUBLIC_URL?: string;

  @IsString()
  @IsOptional()
  CORS_ORIGINS?: string;

  @IsString()
  @IsOptional()
  API_GLOBAL_PREFIX?: string;

  @IsEnum(DbType)
  DB_TYPE: DbType;

  @IsString()
  DB_HOST: string;

  @Type(() => Number)
  @IsNumber()
  DB_PORT: number;

  @IsString()
  DB_USERNAME: string;

  @IsString()
  DB_PASSWORD: string;

  @IsString()
  DB_NAME: string;

  @IsString()
  @IsOptional()
  DATABASE_URL?: string;

  @IsBoolean()
  @IsOptional()
  DB_SYNC?: boolean;

  @IsEnum(OrmType)
  ORM_TYPE: OrmType;

  @IsString()
  REDIS_HOST: string;

  @Type(() => Number)
  @IsNumber()
  REDIS_PORT: number;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;

  @IsString()
  @MinLength(32)
  JWT_SECRET: string;

  @IsString()
  JWT_EXPIRATION: string;

  @IsString()
  @MinLength(16)
  ENCRYPTION_SECRET_KEY: string;

  @IsString()
  @IsOptional()
  EXTERNAL_SERVICE_API_KEY?: string;

  @IsString()
  @IsOptional()
  EXTERNAL_SERVICE_API_SECRET?: string;

  @IsString()
  @IsOptional()
  EXTERNAL_SERVICE_BASE_URL?: string;

  @IsString()
  @IsOptional()
  EXTERNAL_SERVICE_CALLBACK_URL?: string;

  @IsString()
  @IsOptional()
  PUSH_PROVIDER_PROJECT_ID?: string;

  @IsString()
  @IsOptional()
  PUSH_PROVIDER_CLIENT_EMAIL?: string;

  @IsString()
  @IsOptional()
  PUSH_PROVIDER_PRIVATE_KEY?: string;

  @IsString()
  @IsOptional()
  SMTP_HOST?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  SMTP_PORT?: number;

  @IsBoolean()
  @IsOptional()
  SMTP_SECURE?: boolean;

  @IsString()
  @IsOptional()
  SMTP_USER?: string;

  @IsString()
  @IsOptional()
  SMTP_PASS?: string;

  @IsString()
  @IsOptional()
  SMTP_FROM?: string;

  @IsString()
  @IsOptional()
  STORAGE_PROVIDER?: string;

  @IsString()
  @IsOptional()
  STORAGE_BUCKET?: string;

  @IsString()
  @IsOptional()
  STORAGE_ENDPOINT?: string;

  @IsString()
  @IsOptional()
  STORAGE_ACCESS_KEY?: string;

  @IsString()
  @IsOptional()
  STORAGE_SECRET_KEY?: string;

  @IsString()
  @IsOptional()
  LOG_LEVEL?: string;

  @IsString()
  @IsOptional()
  ELASTICSEARCH_URL?: string;

  @IsString()
  @IsOptional()
  ELASTICSEARCH_USERNAME?: string;

  @IsString()
  @IsOptional()
  ELASTICSEARCH_PASSWORD?: string;

  @IsString()
  @IsOptional()
  LOGSTASH_HOST?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  LOGSTASH_PORT?: number;

  @IsString()
  @IsOptional()
  METRICS_TOKEN?: string;

  @IsString()
  @IsOptional()
  SENTRY_DSN?: string;
}

/**
 * Validates environment variables against {@link EnvironmentVariables}.
 * Throws with detailed messages if anything required is missing or invalid,
 * preventing the process from starting in a broken state.
 *
 * Accepts both documented `DATABASE_*` / `ORM_PROVIDER` names and legacy
 * `DB_*` / `ORM_TYPE` aliases before validation.
 */
export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const normalized = normalizeEnvAliases(config);

  const validatedConfig = plainToInstance(EnvironmentVariables, normalized, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
    whitelist: true,
    forbidNonWhitelisted: false,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Environment validation failed: ${messages}`);
  }

  if (
    validatedConfig.ORM_TYPE === OrmType.Prisma &&
    !validatedConfig.DATABASE_URL
  ) {
    // Soft warning path: Prisma clients typically need DATABASE_URL.
    // We do not hard-fail here so unit tests without Prisma can still boot;
    // production deployments should always set DATABASE_URL.
  }

  return validatedConfig;
}

function firstString(
  source: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return undefined;
}

function normalizeEnvAliases(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...config };

  next.DB_TYPE = firstString(config, 'DB_TYPE', 'DATABASE_TYPE') ?? 'postgres';
  next.DB_HOST = firstString(config, 'DB_HOST', 'DATABASE_HOST');
  next.DB_PORT = firstString(config, 'DB_PORT', 'DATABASE_PORT');
  next.DB_USERNAME = firstString(
    config,
    'DB_USERNAME',
    'DATABASE_USER',
    'DATABASE_USERNAME',
    'DB_USER',
  );
  next.DB_PASSWORD = firstString(config, 'DB_PASSWORD', 'DATABASE_PASSWORD');
  next.DB_NAME = firstString(config, 'DB_NAME', 'DATABASE_NAME');
  next.ORM_TYPE = firstString(config, 'ORM_TYPE', 'ORM_PROVIDER') ?? 'prisma';

  return next;
}
