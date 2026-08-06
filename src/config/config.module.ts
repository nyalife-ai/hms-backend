import { Module, Global, DynamicModule } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import configuration from './configuration';
import { validate } from './env.validation';

export interface AppConfigModuleOptions {
  /** Make ConfigService injectable everywhere without re-importing. Default: true. */
  isGlobal?: boolean;
  /** Additional .env file paths to load (first match wins). */
  envFilePath?: string | string[];
}

/**
 * Application Configuration Module.
 *
 * Wraps `@nestjs/config` with typed configuration loading and fail-fast
 * environment validation. Prefer `ConfigModule.forRoot()` from AppModule.
 */
@Global()
@Module({})
export class ConfigModule {
  static forRoot(options: AppConfigModuleOptions = {}): DynamicModule {
    const isGlobal = options.isGlobal ?? true;
    const envFilePath = options.envFilePath ?? ['.env', '.env.local'];

    return {
      module: ConfigModule,
      global: isGlobal,
      imports: [
        NestConfigModule.forRoot({
          isGlobal: true,
          cache: true,
          expandVariables: true,
          load: [configuration],
          validate,
          ignoreEnvFile: false,
          envFilePath,
        }),
      ],
      exports: [NestConfigModule],
    };
  }
}
