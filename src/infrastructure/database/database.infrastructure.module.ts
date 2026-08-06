import {
  Module,
  type DynamicModule,
  type InjectionToken,
  type Provider,
} from '@nestjs/common';
import {
  DATABASE_ADAPTER,
  MIGRATION_RUNNER,
  ORM_PROVIDER,
  PRISMA_CLIENT,
  PrismaTransactionManager,
  RepositoryFactory,
  TRANSACTION_MANAGER,
  TYPEORM_DATA_SOURCE,
  TypeOrmTransactionManager,
  resolveOrmProvider,
  type DataSourceLike,
  type OrmEnvironment,
  type OrmProvider,
  type PrismaClientLike,
} from '../../platform/database';
import {
  InfrastructureConfigService,
  type InfrastructureEnvironment,
} from '../configuration';
import type { ModuleResolver } from '../optional-driver';
import type { DatabaseLogger } from './database-logger.interface';
import { DatabaseHealthIndicator } from './health/database-health.indicator';
import {
  PrismaMigrationRunner,
  type CommandExecutor,
} from './migrations/prisma-migration.runner';
import {
  TypeOrmMigrationRunner,
  type TypeOrmMigrationDataSource,
} from './migrations/typeorm-migration.runner';
import { createPrismaClient } from './prisma/prisma-client.factory';
import { PrismaService } from './prisma/prisma.service';
import { createTypeOrmDataSource } from './typeorm/typeorm-datasource.factory';
import { TypeOrmService } from './typeorm/typeorm.service';

const INFRASTRUCTURE_OPTIONS = Symbol('INFRASTRUCTURE_OPTIONS');

export type DatabaseInfrastructureOptions = Readonly<{
  provider?: OrmProvider;
  env?: InfrastructureEnvironment & OrmEnvironment;
  prismaClientFactory?: () => PrismaClientLike | Promise<PrismaClientLike>;
  typeOrmDataSourceFactory?: () => DataSourceLike | Promise<DataSourceLike>;
  prismaCommandExecutor?: CommandExecutor;
  logger?: DatabaseLogger;
  healthTimeoutMs?: number;
  driverResolver?: ModuleResolver;
}>;

export type DatabaseInfrastructureAsyncOptions = Readonly<{
  imports?: DynamicModule['imports'];
  inject?: readonly InjectionToken[];
  useFactory: (
    ...dependencies: readonly unknown[]
  ) => DatabaseInfrastructureOptions | Promise<DatabaseInfrastructureOptions>;
}>;

const missingExecutor: CommandExecutor = {
  execute: (): Promise<string> =>
    Promise.reject(
      new Error('A Prisma command executor is required for migrations'),
    ),
};

@Module({})
export class DatabaseInfrastructureModule {
  public static forRoot(
    options: DatabaseInfrastructureOptions = {},
  ): DynamicModule {
    const provider = this.resolveProvider(options);
    const config = this.configuration(options);
    const providers: Provider[] = [
      { provide: InfrastructureConfigService, useValue: config },
      { provide: ORM_PROVIDER, useValue: provider },
      ...this.providersFor(provider, options, config),
    ];
    return this.module(providers, options.healthTimeoutMs);
  }

  public static forRootAsync(
    options: DatabaseInfrastructureAsyncOptions,
  ): DynamicModule {
    const optionProvider: Provider = {
      provide: INFRASTRUCTURE_OPTIONS,
      useFactory: options.useFactory,
      inject: [...(options.inject ?? [])],
    };
    const configProvider: Provider = {
      provide: InfrastructureConfigService,
      useFactory: (resolved: DatabaseInfrastructureOptions) =>
        this.configuration(resolved),
      inject: [INFRASTRUCTURE_OPTIONS],
    };
    const ormProvider: Provider = {
      provide: ORM_PROVIDER,
      useFactory: (resolved: DatabaseInfrastructureOptions): OrmProvider =>
        this.resolveProvider(resolved),
      inject: [INFRASTRUCTURE_OPTIONS],
    };
    const adapterProvider: Provider = {
      provide: DATABASE_ADAPTER,
      useFactory: async (
        resolved: DatabaseInfrastructureOptions,
        config: InfrastructureConfigService,
        provider: OrmProvider,
      ): Promise<PrismaService | TypeOrmService> => {
        if (provider === 'prisma') {
          const client = await (resolved.prismaClientFactory?.() ??
            createPrismaClient({
              environment: config.environment,
              datasourceUrl: config.get('DATABASE_URL'),
              logger: resolved.logger,
              resolver: resolved.driverResolver,
            }));
          return new PrismaService(client, config.environment, resolved.logger);
        }
        const dataSource = await (resolved.typeOrmDataSourceFactory?.() ??
          createTypeOrmDataSource({
            config,
            logger: resolved.logger,
            resolver: resolved.driverResolver,
          }));
        return new TypeOrmService(dataSource, resolved.logger);
      },
      inject: [
        INFRASTRUCTURE_OPTIONS,
        InfrastructureConfigService,
        ORM_PROVIDER,
      ],
    };
    const migrationProvider: Provider = {
      provide: MIGRATION_RUNNER,
      useFactory: (
        adapter: PrismaService | TypeOrmService,
        provider: OrmProvider,
        resolved: DatabaseInfrastructureOptions,
      ): PrismaMigrationRunner | TypeOrmMigrationRunner =>
        provider === 'prisma'
          ? new PrismaMigrationRunner(
              resolved.prismaCommandExecutor ?? missingExecutor,
            )
          : new TypeOrmMigrationRunner(
              (
                adapter as TypeOrmService
              ).getDataSource() as TypeOrmMigrationDataSource,
            ),
      inject: [DATABASE_ADAPTER, ORM_PROVIDER, INFRASTRUCTURE_OPTIONS],
    };
    return {
      ...this.module(
        [
          optionProvider,
          configProvider,
          ormProvider,
          adapterProvider,
          migrationProvider,
        ],
        undefined,
      ),
      imports: options.imports,
    };
  }

  private static configuration(
    options: DatabaseInfrastructureOptions,
  ): InfrastructureConfigService {
    const env: InfrastructureEnvironment = {
      ...options.env,
      ...(options.provider === undefined
        ? {}
        : { ORM_PROVIDER: options.provider }),
    };
    return new InfrastructureConfigService(env);
  }

  private static resolveProvider(
    options: DatabaseInfrastructureOptions,
  ): OrmProvider {
    return options.provider === undefined
      ? resolveOrmProvider(options.env)
      : resolveOrmProvider({ ORM_PROVIDER: options.provider });
  }

  private static providersFor(
    provider: OrmProvider,
    options: DatabaseInfrastructureOptions,
    config: InfrastructureConfigService,
  ): Provider[] {
    if (provider === 'prisma') {
      return [
        {
          provide: PRISMA_CLIENT,
          useFactory:
            options.prismaClientFactory ??
            (() =>
              createPrismaClient({
                environment: config.environment,
                datasourceUrl: config.get('DATABASE_URL'),
                logger: options.logger,
                resolver: options.driverResolver,
              })),
        },
        {
          provide: DATABASE_ADAPTER,
          useFactory: (client: PrismaClientLike): PrismaService =>
            new PrismaService(client, config.environment, options.logger),
          inject: [PRISMA_CLIENT],
        },
        {
          provide: MIGRATION_RUNNER,
          useValue: new PrismaMigrationRunner(
            options.prismaCommandExecutor ?? missingExecutor,
          ),
        },
      ];
    }
    return [
      {
        provide: TYPEORM_DATA_SOURCE,
        useFactory:
          options.typeOrmDataSourceFactory ??
          (() =>
            createTypeOrmDataSource({
              config,
              logger: options.logger,
              resolver: options.driverResolver,
            })),
      },
      {
        provide: DATABASE_ADAPTER,
        useFactory: (dataSource: DataSourceLike): TypeOrmService =>
          new TypeOrmService(dataSource, options.logger),
        inject: [TYPEORM_DATA_SOURCE],
      },
      {
        provide: MIGRATION_RUNNER,
        useFactory: (dataSource: TypeOrmMigrationDataSource) =>
          new TypeOrmMigrationRunner(dataSource),
        inject: [TYPEORM_DATA_SOURCE],
      },
    ];
  }

  private static module(
    providers: Provider[],
    healthTimeoutMs: number | undefined,
  ): DynamicModule {
    providers.push(RepositoryFactory, {
      provide: TRANSACTION_MANAGER,
      useFactory: (
        adapter: PrismaService | TypeOrmService,
        provider: OrmProvider,
      ): PrismaTransactionManager | TypeOrmTransactionManager =>
        provider === 'prisma'
          ? new PrismaTransactionManager((adapter as PrismaService).getClient())
          : new TypeOrmTransactionManager(
              (adapter as TypeOrmService).getDataSource(),
            ),
      inject: [DATABASE_ADAPTER, ORM_PROVIDER],
    });
    providers.push({
      provide: DatabaseHealthIndicator,
      useFactory: (
        adapter: PrismaService | TypeOrmService,
      ): DatabaseHealthIndicator =>
        new DatabaseHealthIndicator(adapter, healthTimeoutMs),
      inject: [DATABASE_ADAPTER],
    });
    return {
      module: DatabaseInfrastructureModule,
      providers,
      exports: [
        InfrastructureConfigService,
        ORM_PROVIDER,
        DATABASE_ADAPTER,
        MIGRATION_RUNNER,
        TRANSACTION_MANAGER,
        RepositoryFactory,
        DatabaseHealthIndicator,
      ],
    };
  }
}
