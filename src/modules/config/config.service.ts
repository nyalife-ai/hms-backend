import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface RuntimeConfigSnapshot {
  readonly name: string;
  readonly environment: string;
  readonly version: string;
  readonly orm: string;
  readonly globalPrefix: string;
  readonly documentation?: string;
}

const SECRET_KEY =
  /(password|passwd|pwd|secret|token|api[-_]?key|authorization|credential)/i;

/**
 * Exposes non-secret runtime configuration for operators and clients.
 * Typed env validation stays in `src/config`; this module only reads snapshots.
 */
@Injectable()
export class RuntimeConfigService {
  public constructor(private readonly configService: ConfigService) {}

  public getPublicSnapshot(): RuntimeConfigSnapshot {
    const environment =
      this.configService.get<string>('app.environment') ??
      process.env.NODE_ENV ??
      'development';

    return {
      name:
        this.configService.get<string>('app.name') ??
        process.env.APP_NAME ??
        'api',
      environment,
      version: process.env.npm_package_version ?? '1.0.0',
      orm:
        this.configService.get<string>('orm.type') ??
        process.env.ORM_PROVIDER ??
        process.env.ORM_TYPE ??
        'prisma',
      globalPrefix: this.configService.get<string>('app.globalPrefix') ?? '',
      documentation: environment === 'production' ? undefined : '/api/docs',
    };
  }

  public getMaskedInternalSnapshot(): Readonly<Record<string, unknown>> {
    return this.maskSecrets({
      app: {
        name: this.configService.get<string>('app.name'),
        environment: this.configService.get<string>('app.environment'),
        port: this.configService.get<number>('app.port'),
        globalPrefix: this.configService.get<string>('app.globalPrefix'),
      },
      orm: {
        type: this.configService.get<string>('orm.type'),
      },
      redis: {
        host: this.configService.get<string>('redis.host'),
        port: this.configService.get<number>('redis.port'),
        password: this.configService.get<string>('redis.password'),
      },
      database: {
        host: this.configService.get<string>('database.host'),
        port: this.configService.get<number>('database.port'),
        name: this.configService.get<string>('database.name'),
        username: this.configService.get<string>('database.username'),
        password: this.configService.get<string>('database.password'),
      },
    }) as Readonly<Record<string, unknown>>;
  }

  private maskSecrets(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.maskSecrets(item));
    }
    if (typeof value !== 'object' || value === null) {
      return value;
    }
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = SECRET_KEY.test(key) ? '[REDACTED]' : this.maskSecrets(nested);
    }
    return out;
  }
}
