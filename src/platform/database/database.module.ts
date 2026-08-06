import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import type { MigrationRunner } from './contracts/migration-runner.interface';
import {
  DATABASE_ADAPTER,
  MIGRATION_RUNNER,
  ORM_PROVIDER,
  PRISMA_CLIENT,
  TYPEORM_DATA_SOURCE,
} from './providers/database.tokens';
import {
  resolveOrmProvider,
  type OrmEnvironment,
  type OrmProvider,
} from './providers/orm.types';
import type { PrismaClientLike } from './prisma/prisma-client.types';
import { PrismaAdapter } from './prisma/prisma.adapter';
import { PrismaTransactionManager } from './prisma/prisma.transaction-manager';
import type { DataSourceLike } from './typeorm/typeorm-client.types';
import { TypeOrmAdapter } from './typeorm/typeorm.adapter';
import { TypeOrmTransactionManager } from './typeorm/typeorm.transaction-manager';
import { TRANSACTION_MANAGER } from './transactions/transaction-manager.token';
import { DatabaseHealthService } from './health/database-health.service';
import {
  MigrationService,
  NoopMigrationRunner,
} from './migrations/migration.service';

export interface DatabaseModuleOptions {
  readonly provider?: OrmProvider;
  readonly env?: OrmEnvironment;
  readonly prismaClientFactory?: () =>
    PrismaClientLike | Promise<PrismaClientLike>;
  readonly typeOrmDataSourceFactory?: () =>
    DataSourceLike | Promise<DataSourceLike>;
  readonly migrationRunner?: MigrationRunner;
  /**
   * Explicitly allow {@link NoopMigrationRunner} in production.
   * Required when production would otherwise use a no-op runner.
   */
  readonly allowNoopMigrations?: boolean;
  /**
   * Override production detection (defaults to `NODE_ENV === 'production'`).
   * Intended for tests.
   */
  readonly isProduction?: boolean;
}

@Module({})
export class DatabaseModule {
  public static forRoot(options: DatabaseModuleOptions = {}): DynamicModule {
    const provider = options.provider ?? resolveOrmProvider(options.env);
    const isProduction =
      options.isProduction ?? process.env['NODE_ENV'] === 'production';
    const migrationRunner =
      options.migrationRunner ?? new NoopMigrationRunner();
    const usingNoop =
      options.migrationRunner === undefined ||
      migrationRunner instanceof NoopMigrationRunner;

    if (isProduction && usingNoop && options.allowNoopMigrations !== true) {
      throw new Error(
        'DatabaseModule: a real migrationRunner is required in production (or set allowNoopMigrations: true)',
      );
    }

    const providers: Provider[] = [
      { provide: ORM_PROVIDER, useValue: provider },
      {
        provide: MIGRATION_RUNNER,
        useValue: migrationRunner,
      },
      MigrationService,
      DatabaseHealthService,
      ...this.ormProviders(provider, options),
    ];

    return {
      module: DatabaseModule,
      providers,
      exports: [
        ORM_PROVIDER,
        DATABASE_ADAPTER,
        TRANSACTION_MANAGER,
        MigrationService,
        DatabaseHealthService,
      ],
    };
  }

  private static ormProviders(
    provider: OrmProvider,
    options: DatabaseModuleOptions,
  ): Provider[] {
    if (provider === 'prisma') {
      if (options.prismaClientFactory === undefined) {
        throw new Error(
          'prismaClientFactory is required for the Prisma provider',
        );
      }
      return [
        { provide: PRISMA_CLIENT, useFactory: options.prismaClientFactory },
        {
          provide: DATABASE_ADAPTER,
          useFactory: (client: PrismaClientLike): PrismaAdapter =>
            new PrismaAdapter(client),
          inject: [PRISMA_CLIENT],
        },
        {
          provide: TRANSACTION_MANAGER,
          useFactory: (client: PrismaClientLike): PrismaTransactionManager =>
            new PrismaTransactionManager(client),
          inject: [PRISMA_CLIENT],
        },
      ];
    }

    if (options.typeOrmDataSourceFactory === undefined) {
      throw new Error(
        'typeOrmDataSourceFactory is required for the TypeORM provider',
      );
    }
    return [
      {
        provide: TYPEORM_DATA_SOURCE,
        useFactory: options.typeOrmDataSourceFactory,
      },
      {
        provide: DATABASE_ADAPTER,
        useFactory: (dataSource: DataSourceLike): TypeOrmAdapter =>
          new TypeOrmAdapter(dataSource),
        inject: [TYPEORM_DATA_SOURCE],
      },
      {
        provide: TRANSACTION_MANAGER,
        useFactory: (dataSource: DataSourceLike): TypeOrmTransactionManager =>
          new TypeOrmTransactionManager(dataSource),
        inject: [TYPEORM_DATA_SOURCE],
      },
    ];
  }
}
