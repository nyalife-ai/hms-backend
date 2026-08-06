import { DynamicModule, Module, Provider } from '@nestjs/common';
import { SECRET_PROVIDER } from '../architecture/tokens/injection.tokens';
import type { SecretProvider } from '../architecture/secret-provider.interface';
import { ConfigSchema } from './config.schema';
import { ConfigValidator } from './config-validator';
import { ConfigurationService } from './configuration.service';
import { SecretLoader } from './secret-loader';

export { SECRET_PROVIDER } from '../architecture/tokens/injection.tokens';

export interface ConfigurationModuleOptions<
  T extends Readonly<Record<string, unknown>> = Readonly<
    Record<string, unknown>
  >,
> {
  readonly values?: Readonly<Record<string, unknown>>;
  readonly schema?: ConfigSchema<T>;
  readonly environment?: string;
  readonly secretProvider?: SecretProvider;
}

@Module({})
export class ConfigurationModule {
  public static register<
    T extends Readonly<Record<string, unknown>> = Readonly<
      Record<string, unknown>
    >,
  >(options: ConfigurationModuleOptions<T> = {}): DynamicModule {
    const validator = new ConfigValidator();
    const values = options.schema
      ? validator.validate(options.values ?? {}, options.schema)
      : (options.values ?? {});
    const providers: Provider[] = [
      { provide: ConfigValidator, useValue: validator },
      {
        provide: ConfigurationService,
        useValue: new ConfigurationService(values, options.environment),
      },
    ];
    const exportedProviders: Array<string | symbol | Provider> = [
      ConfigValidator,
      ConfigurationService,
    ];
    if (options.secretProvider) {
      providers.push(
        { provide: SECRET_PROVIDER, useValue: options.secretProvider },
        {
          provide: SecretLoader,
          useFactory: (provider: SecretProvider): SecretLoader =>
            new SecretLoader(provider),
          inject: [SECRET_PROVIDER],
        },
      );
      exportedProviders.push(SecretLoader, SECRET_PROVIDER);
    }
    return {
      module: ConfigurationModule,
      providers,
      exports: exportedProviders,
    };
  }
}
