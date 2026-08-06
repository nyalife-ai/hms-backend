import type { DataSourceLike } from '../../../platform/database';
import { loadDriver, type ModuleResolver } from '../../optional-driver';
import type { InfrastructureConfigService } from '../../configuration';
import { maskSecrets } from '../../configuration';
import type { DatabaseLogger } from '../database-logger.interface';

type DataSourceConstructor = new (
  options: Readonly<Record<string, unknown>>,
) => DataSourceLike;
type TypeOrmDriver = Readonly<{ DataSource: DataSourceConstructor }>;

export type TypeOrmDataSourceFactoryOptions = Readonly<{
  config: InfrastructureConfigService;
  resolver?: ModuleResolver;
  logger?: DatabaseLogger;
  synchronize?: boolean;
}>;

export function createTypeOrmDataSource(
  input: TypeOrmDataSourceFactoryOptions,
): DataSourceLike {
  const driver = loadDriver<TypeOrmDriver>('typeorm', input.resolver);
  const url = input.config.get('DATABASE_URL');
  const options: Readonly<Record<string, unknown>> =
    url !== undefined
      ? {
          type: databaseType(url),
          url,
          synchronize:
            input.config.environment === 'production'
              ? false
              : (input.synchronize ?? false),
        }
      : {
          type: 'postgres',
          host: input.config.getOrThrow('DATABASE_HOST'),
          port: input.config.get('DATABASE_PORT'),
          database: input.config.getOrThrow('DATABASE_NAME'),
          username: input.config.getOrThrow('DATABASE_USER'),
          password: input.config.getOrThrow('DATABASE_PASSWORD'),
          synchronize:
            input.config.environment === 'production'
              ? false
              : (input.synchronize ?? false),
        };
  input.logger?.debug('Creating TypeORM datasource', maskSecrets(options));
  return new driver.DataSource(options);
}

function databaseType(url: string): string {
  const protocol = new URL(url).protocol.replace(':', '');
  return protocol === 'postgresql' ? 'postgres' : protocol;
}
