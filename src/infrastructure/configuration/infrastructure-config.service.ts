import { Injectable } from '@nestjs/common';
import {
  ConfigValidator,
  resolveEnvironment,
  type Environment,
} from '../../platform/configuration';
import {
  infrastructureConfigSchema,
  type InfrastructureConfig,
} from './infrastructure-config.schema';
import { maskSecrets } from './mask-secrets';

export type InfrastructureEnvironment = Readonly<
  Record<string, string | undefined>
>;

@Injectable()
export class InfrastructureConfigService {
  public readonly environment: Environment;
  private readonly config: Readonly<InfrastructureConfig>;

  public constructor(
    ...args:
      | readonly []
      | readonly [InfrastructureEnvironment]
      | readonly [InfrastructureEnvironment, ConfigValidator]
  ) {
    const [env, validator] = args;
    const raw = this.normalize(env ?? process.env);
    this.config = (validator ?? new ConfigValidator()).validate(
      raw,
      infrastructureConfigSchema,
    );
    this.environment = resolveEnvironment(this.config.NODE_ENV);
    this.assertProductionSafety();
  }

  public get<K extends keyof InfrastructureConfig>(
    key: K,
  ): InfrastructureConfig[K] {
    return this.config[key];
  }

  public getOrThrow<K extends keyof InfrastructureConfig>(
    key: K,
  ): NonNullable<InfrastructureConfig[K]> {
    const value = this.config[key];
    if (value === undefined || value === '') {
      throw new Error(`Missing infrastructure configuration "${String(key)}"`);
    }
    return value;
  }

  public snapshot(): Readonly<InfrastructureConfig> {
    return this.config;
  }

  public toJSON(): Readonly<Record<string, unknown>> {
    return maskSecrets(this.config);
  }

  private normalize(
    env: InfrastructureEnvironment,
  ): Readonly<Record<string, unknown>> {
    const aliased: InfrastructureEnvironment = {
      ...env,
      ORM_PROVIDER: env.ORM_PROVIDER ?? env.ORM_TYPE,
      DATABASE_HOST: env.DATABASE_HOST ?? env.DB_HOST,
      DATABASE_PORT: env.DATABASE_PORT ?? env.DB_PORT,
      DATABASE_USER: env.DATABASE_USER ?? env.DB_USERNAME ?? env.DB_USER,
      DATABASE_PASSWORD: env.DATABASE_PASSWORD ?? env.DB_PASSWORD,
      DATABASE_NAME: env.DATABASE_NAME ?? env.DB_NAME,
      REDIS_URL: env.REDIS_URL ?? buildRedisUrlFromParts(env),
    };

    const raw: Record<string, unknown> = {};
    const keys = Object.keys(infrastructureConfigSchema.fields) as Array<
      keyof InfrastructureConfig
    >;
    for (const key of keys) {
      const value =
        key === 'NODE_ENV' && aliased[key] === 'test'
          ? 'development'
          : aliased[key];
      if (value !== undefined) {
        raw[key] = key === 'DATABASE_PORT' ? Number(value) : value;
      }
    }
    return raw;
  }

  private assertProductionSafety(): void {
    if (this.environment !== 'production') {
      return;
    }
    const url = this.config.DATABASE_URL;
    if (this.config.ORM_PROVIDER === 'prisma') {
      this.getOrThrow('DATABASE_URL');
    } else if (url === undefined) {
      const required: Array<keyof InfrastructureConfig> = [
        'DATABASE_HOST',
        'DATABASE_NAME',
        'DATABASE_USER',
        'DATABASE_PASSWORD',
      ];
      for (const key of required) {
        this.getOrThrow(key);
      }
    }
    const password =
      url === undefined ? this.config.DATABASE_PASSWORD : new URL(url).password;
    if (password === undefined || password.length < 12) {
      throw new Error(
        'Production database password must contain at least 12 characters',
      );
    }
  }
}

function buildRedisUrlFromParts(
  env: InfrastructureEnvironment,
): string | undefined {
  const host = env.REDIS_HOST;
  if (host === undefined || host === '') {
    return undefined;
  }
  const port = env.REDIS_PORT ?? '6379';
  const password = env.REDIS_PASSWORD;
  if (password !== undefined && password !== '') {
    return `redis://:${encodeURIComponent(password)}@${host}:${port}`;
  }
  return `redis://${host}:${port}`;
}
