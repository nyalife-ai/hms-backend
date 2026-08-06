import { Test } from '@nestjs/testing';
import { Module } from '@nestjs/common';
import {
  DATABASE_ADAPTER,
  MIGRATION_RUNNER,
  ORM_PROVIDER,
  PrismaTransactionManager,
  RepositoryFactory,
  TRANSACTION_MANAGER,
  TypeOrmTransactionManager,
  type DataSourceLike,
  type PrismaClientLike,
  type QueryRunnerLike,
} from '../../../platform/database';
import { MissingDriverError, type ModuleResolver } from '../../optional-driver';
import { InfrastructureConfigService } from '../../configuration';
import {
  DatabaseApiHealthIndicator,
  RedisApiHealthIndicator,
} from '../../health';
import {
  DatabaseHealthIndicator,
  DatabaseInfrastructureModule,
  NotSupportedError,
  PrismaMigrationRunner,
  PrismaService,
  SeedRunner,
  TypeOrmMigrationRunner,
  TypeOrmService,
  adaptPrismaClient,
  createPrismaClient,
  createTypeOrmDataSource,
  type CommandExecutor,
  type DatabaseLogger,
  type SeedTransaction,
  type Timer,
} from '..';

@Module({})
class EmptyImportedModule {}

const logger = (): jest.Mocked<DatabaseLogger> => ({
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

const prisma = (): jest.Mocked<PrismaClientLike> => ({
  $connect: jest.fn().mockResolvedValue(undefined),
  $disconnect: jest.fn().mockResolvedValue(undefined),
  $transaction: jest.fn(async (work: (client: unknown) => Promise<unknown>) =>
    work({}),
  ) as unknown as jest.Mocked<PrismaClientLike>['$transaction'],
  healthCheck: jest.fn().mockResolvedValue([{ one: 1 }]),
  queryRaw: jest.fn().mockResolvedValue([{ one: 1 }]),
});

const runner = (): jest.Mocked<QueryRunnerLike> => ({
  connect: jest.fn().mockResolvedValue(undefined),
  startTransaction: jest.fn().mockResolvedValue(undefined),
  commitTransaction: jest.fn().mockResolvedValue(undefined),
  rollbackTransaction: jest.fn().mockResolvedValue(undefined),
  release: jest.fn().mockResolvedValue(undefined),
  query: jest.fn().mockResolvedValue(undefined),
});

const dataSource = (
  queryRunner: QueryRunnerLike = runner(),
): jest.Mocked<DataSourceLike> => ({
  isInitialized: false,
  initialize: jest.fn().mockResolvedValue(undefined),
  destroy: jest.fn().mockResolvedValue(undefined),
  query: jest.fn().mockResolvedValue([{ one: 1 }]),
  createQueryRunner: jest.fn(() => queryRunner),
});

describe('PrismaService', () => {
  it('connects and disconnects idempotently, including concurrent calls', async () => {
    const client = prisma();
    const log = logger();
    const service = new PrismaService(client, 'development', log);
    await Promise.all([service.connect(), service.connect()]);
    await service.connect();
    expect(client.$connect).toHaveBeenCalledTimes(1);
    expect(log.debug).toHaveBeenCalledWith('Prisma connected');
    await Promise.all([service.onModuleDestroy(), service.onModuleDestroy()]);
    await service.disconnect();
    expect(client.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('supports lifecycle, transactions, health, and production logging', async () => {
    const client = prisma();
    const log = logger();
    const times = [10, 13, 20, 19];
    const service = new PrismaService(
      client,
      'production',
      log,
      () => times.shift() ?? 0,
    );
    await service.onModuleInit();
    expect(log.debug).not.toHaveBeenCalled();
    const txClient = { marker: 'tx' };
    client.$transaction.mockImplementationOnce(
      async (work: (client: unknown) => Promise<unknown>) => work(txClient),
    );
    await expect(
      service.transaction(async (tx) => {
        expect(tx).toBe(txClient);
        return 42;
      }),
    ).resolves.toBe(42);
    await expect(
      Promise.all([service.healthCheck(), service.healthCheck()]),
    ).resolves.toHaveLength(2);
    await service.onModuleDestroy();
  });

  it('propagates connection and transaction failures with masked logs', async () => {
    const client = prisma();
    const log = logger();
    client.$connect.mockRejectedValueOnce(
      new Error('postgres://user:password@host/db'),
    );
    const service = new PrismaService(client, 'development', log);
    const connecting = service.connect();
    const disconnecting = service.disconnect();
    await expect(connecting).rejects.toThrow('password');
    await expect(disconnecting).resolves.toBeUndefined();
    expect(JSON.stringify(log.error.mock.calls)).not.toContain(':password@');
    await service.disconnect();
    client.$transaction.mockRejectedValueOnce(new Error('token=private'));
    await expect(service.transaction(async () => 1)).rejects.toThrow('private');
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain('private');
  });

  it('reports health up without raw query and down with masked errors', async () => {
    const withoutQuery = prisma();
    delete withoutQuery.healthCheck;
    delete withoutQuery.queryRaw;
    await new PrismaService(withoutQuery).disconnect();
    await expect(
      new PrismaService(
        withoutQuery,
        'development',
        undefined,
        () => 5,
      ).healthCheck(),
    ).resolves.toEqual({
      status: 'up',
      latencyMs: 0,
      details: { provider: 'prisma' },
    });
    const queryOnly = prisma();
    delete queryOnly.healthCheck;
    await expect(
      new PrismaService(
        queryOnly,
        'development',
        undefined,
        () => 5,
      ).healthCheck(),
    ).resolves.toMatchObject({ status: 'up' });
    expect(queryOnly.queryRaw).toHaveBeenCalledWith('SELECT 1');
    const client = prisma();
    (client.healthCheck as jest.Mock<Promise<unknown>, []>).mockRejectedValue(
      new Error('postgres://u:secret@host/db'),
    );
    const log = logger();
    const times = [8, 12];
    const health = await new PrismaService(
      client,
      'development',
      log,
      () => times.shift() ?? 0,
    ).healthCheck();
    expect(health.status).toBe('down');
    expect(JSON.stringify(health)).not.toContain('secret');
    expect(log.error).toHaveBeenCalled();
  });
});

describe('TypeOrmService', () => {
  it('manages idempotent concurrent lifecycle and preinitialized sources', async () => {
    const source = dataSource();
    const service = new TypeOrmService(source);
    await Promise.all([service.connect(), service.connect()]);
    await service.onModuleInit();
    expect(source.initialize).toHaveBeenCalledTimes(1);
    await Promise.all([service.onModuleDestroy(), service.disconnect()]);
    expect(source.destroy).toHaveBeenCalledTimes(1);

    const ready = dataSource();
    Object.defineProperty(ready, 'isInitialized', { value: true });
    const alreadyReady = new TypeOrmService(ready);
    await alreadyReady.connect();
    await alreadyReady.disconnect();
    expect(ready.initialize).not.toHaveBeenCalled();
    expect(ready.destroy).toHaveBeenCalled();
  });

  it('handles failed initialization and safe cleanup', async () => {
    const source = dataSource();
    const log = logger();
    source.initialize.mockRejectedValueOnce(new Error('password=secret'));
    const service = new TypeOrmService(source, log);
    const connecting = service.connect();
    const disconnecting = service.disconnect();
    await expect(connecting).rejects.toThrow('secret');
    await expect(disconnecting).resolves.toBeUndefined();
    expect(JSON.stringify(log.error.mock.calls)).not.toContain('secret');
    await service.disconnect();
    expect(source.destroy).not.toHaveBeenCalled();
  });

  it('commits and rolls back transactions and always releases runners', async () => {
    const successful = runner();
    const service = new TypeOrmService(dataSource(successful));
    await expect(
      service.transaction(async (tx) => {
        expect(tx).toBe(successful);
        return 'done';
      }),
    ).resolves.toBe('done');
    expect(successful.commitTransaction).toHaveBeenCalled();
    expect(successful.release).toHaveBeenCalled();

    const failed = runner();
    await expect(
      new TypeOrmService(dataSource(failed)).transaction(async () => {
        throw new Error('work failed');
      }),
    ).rejects.toThrow('work failed');
    expect(failed.rollbackTransaction).toHaveBeenCalled();
    expect(failed.release).toHaveBeenCalled();

    const startFailure = runner();
    startFailure.startTransaction.mockRejectedValueOnce(new Error('start'));
    await expect(
      new TypeOrmService(dataSource(startFailure)).transaction(async () => 1),
    ).rejects.toThrow('start');
    expect(startFailure.release).toHaveBeenCalled();
  });

  it('preserves work errors when rollback fails', async () => {
    const failed = runner();
    failed.rollbackTransaction.mockRejectedValueOnce(
      new Error('password=rollback-secret'),
    );
    const log = logger();
    await expect(
      new TypeOrmService(dataSource(failed), log).transaction(async () => {
        throw new Error('original');
      }),
    ).rejects.toThrow('original');
    expect(JSON.stringify(log.error.mock.calls)).not.toContain(
      'rollback-secret',
    );
  });

  it('checks health and delegates optional migrations', async () => {
    const source = Object.assign(dataSource(), {
      runMigrations: jest.fn().mockResolvedValue([]),
      undoLastMigration: jest.fn().mockResolvedValue(undefined),
    });
    const times = [1, 4];
    const service = new TypeOrmService(
      source,
      undefined,
      () => times.shift() ?? 0,
    );
    await expect(service.healthCheck()).resolves.toEqual({
      status: 'up',
      latencyMs: 3,
      details: { provider: 'typeorm' },
    });
    await service.runMigrations();
    await service.undoLastMigration();
    expect(service.getDataSource()).toBe(source);

    const unsupported = new TypeOrmService(dataSource());
    await expect(unsupported.runMigrations()).rejects.toThrow(
      'does not support',
    );
    await expect(unsupported.undoLastMigration()).rejects.toThrow(
      'does not support',
    );
  });

  it('reports down health with masked details', async () => {
    const source = dataSource();
    source.query.mockRejectedValueOnce(
      new Error('postgres://u:health-secret@host/db'),
    );
    const log = logger();
    const times = [10, 9];
    const health = await new TypeOrmService(
      source,
      log,
      () => times.shift() ?? 0,
    ).healthCheck();
    expect(health.latencyMs).toBe(0);
    expect(health.status).toBe('down');
    expect(JSON.stringify(health)).not.toContain('health-secret');
  });
});

describe('driver factories', () => {
  it('constructs Prisma lazily with environment-specific logs', async () => {
    const constructor = jest.fn(function PrismaClient(
      this: {
        $connect: PrismaClientLike['$connect'];
        $disconnect: PrismaClientLike['$disconnect'];
        $transaction: PrismaClientLike['$transaction'];
        $queryRaw: (
          query: TemplateStringsArray,
          ...values: unknown[]
        ) => Promise<unknown>;
        $queryRawUnsafe: (
          query: string,
          ...values: unknown[]
        ) => Promise<unknown>;
      },
      _options: unknown,
    ): void {
      Object.assign(this, {
        $connect: jest.fn().mockResolvedValue(undefined),
        $disconnect: jest.fn().mockResolvedValue(undefined),
        $transaction: jest.fn(
          async (work: (client: unknown) => Promise<unknown>) => work({}),
        ),
        $queryRaw: jest.fn().mockResolvedValue([{ one: 1 }]),
        $queryRawUnsafe: jest.fn().mockResolvedValue([{ one: 1 }]),
      });
    });
    const resolver: ModuleResolver = jest.fn(() => ({
      PrismaClient: constructor,
    }));
    const log = logger();
    const adapted = createPrismaClient({
      datasourceUrl: 'postgres://u:secret@host/db',
      resolver,
      logger: log,
    });
    createPrismaClient({ environment: 'production', resolver });
    expect(resolver).toHaveBeenCalledWith('@prisma/client');
    expect(constructor.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        log: ['query', 'info', 'warn', 'error'],
      }),
    );
    expect(constructor.mock.calls[1]?.[0]).toEqual({
      log: ['warn', 'error'],
    });
    expect(JSON.stringify(log.debug.mock.calls)).not.toContain('secret');
    expect(adapted.healthCheck).toBeDefined();
    expect(adapted.queryRaw).toBeDefined();
    await adapted.$connect();
    await adapted.$disconnect();
    await expect(
      adapted.$transaction(async (tx) => {
        expect(tx).toEqual({});
        return 7;
      }),
    ).resolves.toBe(7);
    await expect(adapted.healthCheck?.()).resolves.toEqual([{ one: 1 }]);
    await expect(adapted.queryRaw?.('SELECT 1', [])).resolves.toEqual([
      { one: 1 },
    ]);

    const withoutUnsafe = {
      $connect: jest.fn().mockResolvedValue(undefined),
      $disconnect: jest.fn().mockResolvedValue(undefined),
      $transaction: jest.fn(
        async (work: (client: unknown) => Promise<unknown>) => work({}),
      ),
      $queryRaw: jest.fn().mockResolvedValue([{ one: 1 }]),
    };
    const adaptedUnsafe = adaptPrismaClient(withoutUnsafe);
    await expect(adaptedUnsafe.queryRaw?.('SELECT 1')).rejects.toThrow(
      'parameterized queryRaw',
    );
  });

  it('surfaces optional driver failures', () => {
    const resolver = (): never => {
      throw new Error('missing');
    };
    expect(() => createPrismaClient({ resolver })).toThrow(MissingDriverError);
  });

  it('constructs TypeORM from URL and discrete settings safely', () => {
    const constructor = jest.fn(function DataSource(
      this: DataSourceLike,
      _options: unknown,
    ): void {
      Object.assign(this, dataSource());
    });
    const resolver: ModuleResolver = () => ({ DataSource: constructor });
    const prod = new InfrastructureConfigService({
      NODE_ENV: 'production',
      ORM_PROVIDER: 'typeorm',
      DATABASE_URL: 'postgresql://u:long-enough-password@host/db',
    });
    const log = logger();
    createTypeOrmDataSource({
      config: prod,
      resolver,
      logger: log,
      synchronize: true,
    });
    expect(constructor.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ type: 'postgres', synchronize: false }),
    );
    expect(JSON.stringify(log.debug.mock.calls)).not.toContain(
      'long-enough-password',
    );

    const dev = new InfrastructureConfigService({
      DATABASE_HOST: 'host',
      DATABASE_NAME: 'db',
      DATABASE_USER: 'user',
      DATABASE_PASSWORD: 'secret',
    });
    createTypeOrmDataSource({ config: dev, resolver, synchronize: true });
    expect(constructor.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        host: 'host',
        password: 'secret',
        synchronize: true,
      }),
    );
    createTypeOrmDataSource({ config: dev, resolver });
    expect(constructor.mock.calls[2]?.[0]).toEqual(
      expect.objectContaining({ synchronize: false }),
    );
    const mysql = new InfrastructureConfigService({
      DATABASE_URL: 'mysql://user:secret@host/db',
    });
    createTypeOrmDataSource({ config: mysql, resolver });
    expect(constructor.mock.calls[3]?.[0]).toEqual(
      expect.objectContaining({ type: 'mysql', synchronize: false }),
    );

    const discreteProd = new InfrastructureConfigService({
      NODE_ENV: 'production',
      ORM_PROVIDER: 'typeorm',
      DATABASE_HOST: 'host',
      DATABASE_NAME: 'db',
      DATABASE_USER: 'user',
      DATABASE_PASSWORD: 'long-enough-password',
    });
    createTypeOrmDataSource({
      config: discreteProd,
      resolver,
      synchronize: true,
    });
    expect(constructor.mock.calls[4]?.[0]).toEqual(
      expect.objectContaining({ synchronize: false }),
    );
  });

  it('surfaces missing TypeORM drivers', () => {
    expect(() =>
      createTypeOrmDataSource({
        config: new InfrastructureConfigService(),
        resolver: () => {
          throw new Error('missing');
        },
      }),
    ).toThrow(MissingDriverError);
  });
});

describe('migration and seed runners', () => {
  it('delegates Prisma migration commands and parses status', async () => {
    const executor: jest.Mocked<CommandExecutor> = {
      execute: jest
        .fn()
        .mockResolvedValue(JSON.stringify({ pending: ['b'], applied: ['a'] })),
    };
    const migrations = new PrismaMigrationRunner(executor);
    await migrations.run();
    expect(executor.execute).toHaveBeenCalledWith('prisma', [
      'migrate',
      'deploy',
    ]);
    await expect(migrations.revert()).rejects.toBeInstanceOf(NotSupportedError);
    await expect(migrations.revert()).rejects.toThrow(
      'no simple down migration',
    );
    expect(executor.execute).not.toHaveBeenCalledWith('prisma', [
      'migrate',
      'reset',
      '--force',
    ]);
    await expect(migrations.status()).resolves.toEqual({
      pending: ['b'],
      applied: ['a'],
    });
    const custom = new PrismaMigrationRunner(executor, () => ({
      pending: [],
      applied: ['custom'],
    }));
    await expect(custom.status()).resolves.toEqual({
      pending: [],
      applied: ['custom'],
    });
    executor.execute.mockResolvedValueOnce('{}');
    await expect(migrations.status()).resolves.toEqual({
      pending: [],
      applied: [],
    });
  });

  it('delegates TypeORM migrations and derives status', async () => {
    const source = {
      migrations: [{ name: 'a' }, { name: 'b' }, {}],
      runMigrations: jest.fn().mockResolvedValue([]),
      undoLastMigration: jest.fn().mockResolvedValue(undefined),
      getAppliedMigrations: jest.fn().mockResolvedValue([{ name: 'a' }, {}]),
    };
    const migrations = new TypeOrmMigrationRunner(source);
    await migrations.run();
    await migrations.revert();
    await expect(migrations.status()).resolves.toEqual({
      applied: ['a'],
      pending: ['b'],
    });
    await expect(
      new TypeOrmMigrationRunner({
        runMigrations: source.runMigrations,
        undoLastMigration: source.undoLastMigration,
      }).status(),
    ).resolves.toEqual({ applied: [], pending: [] });
  });

  it('orders, isolates, transacts, and skips idempotent seeds', async () => {
    const calls: string[] = [];
    const transaction = jest.fn(
      async (work: () => Promise<unknown>): Promise<unknown> => work(),
    ) as unknown as SeedTransaction;
    const seeds = new SeedRunner(transaction);
    const units = [
      {
        name: 'first',
        idempotent: true,
        run: async (): Promise<void> => {
          calls.push('first');
        },
      },
      {
        name: 'disabled',
        shouldRun: async (): Promise<boolean> => false,
        run: async (): Promise<void> => {
          calls.push('disabled');
        },
      },
      {
        name: 'last',
        shouldRun: (): boolean => true,
        run: async (): Promise<void> => {
          calls.push('last');
        },
      },
    ];
    await seeds.run(units);
    expect(calls).toEqual(['first', 'last']);
    expect(seeds.results.map((item) => item.status)).toEqual([
      'completed',
      'skipped',
      'completed',
    ]);
    await seeds.run(units);
    expect(seeds.results[0]?.status).toBe('skipped');
    expect(transaction).toHaveBeenCalled();

    const failing = new SeedRunner(transaction);
    await expect(
      failing.run([
        {
          name: 'failure',
          run: async (): Promise<void> => {
            throw new Error('token=seed-secret');
          },
        },
        {
          name: 'after-failure',
          run: async (): Promise<void> => {
            calls.push('after-failure');
          },
        },
      ]),
    ).rejects.toThrow('token=seed-secret');
    expect(calls).not.toContain('after-failure');
    expect(failing.results).toEqual([
      expect.objectContaining({ name: 'failure', status: 'failed' }),
    ]);
    expect(JSON.stringify(failing.results)).not.toContain('seed-secret');

    const direct = new SeedRunner();
    await direct.run([{ name: 'plain', run: async () => undefined }]);
    expect(direct.results[0]?.status).toBe('completed');
  });
});

describe('health indicator', () => {
  it('bridges healthy and timed-out checks using an injected timer', async () => {
    const healthy = {
      connect: jest.fn(),
      disconnect: jest.fn(),
      transaction: jest.fn(),
      healthCheck: jest.fn().mockResolvedValue({
        status: 'up',
        latencyMs: 1,
      }),
    };
    await expect(new DatabaseHealthIndicator(healthy).check()).resolves.toEqual(
      {
        database: { status: 'up', latencyMs: 1 },
      },
    );

    let callback: (() => void) | undefined;
    const timer: jest.Mocked<Timer> = {
      set: jest.fn((next, _delayMs) => {
        callback = next;
        return 7;
      }),
      clear: jest.fn(),
    };
    const hanging = {
      ...healthy,
      healthCheck: jest.fn(() => new Promise<never>(() => undefined)),
    };
    const check = new DatabaseHealthIndicator(hanging, 25, timer).check();
    callback?.();
    await expect(check).resolves.toEqual({
      database: {
        status: 'down',
        latencyMs: 25,
        details: { error: 'Database health check timed out' },
      },
    });
    expect(timer.clear).toHaveBeenCalledWith(7);
  });
});

describe('platform health adapters', () => {
  it('maps database probes and passes Redis probes through', async () => {
    const healthyDatabase = new DatabaseApiHealthIndicator({
      check: async () => ({
        database: { status: 'up', latencyMs: 3 },
      }),
    });
    await expect(healthyDatabase.check()).resolves.toEqual({
      name: 'database',
      status: 'up',
      durationMs: 3,
    });

    const failedDatabase = new DatabaseApiHealthIndicator({
      check: async () => ({
        database: {
          status: 'down',
          latencyMs: 4,
          details: { error: 'offline' },
        },
      }),
    });
    await expect(failedDatabase.check()).resolves.toEqual({
      name: 'database',
      status: 'down',
      durationMs: 4,
      message: 'offline',
    });

    const redisResult = {
      name: 'redis',
      status: 'up' as const,
      durationMs: 1,
    };
    const redis = new RedisApiHealthIndicator({
      check: async () => redisResult,
    });
    expect(redis.name).toBe('redis');
    await expect(redis.check()).resolves.toBe(redisResult);
  });
});

describe('DatabaseInfrastructureModule', () => {
  it('selects only Prisma and binds platform tokens', async () => {
    const client = prisma();
    const module = await Test.createTestingModule({
      imports: [
        DatabaseInfrastructureModule.forRoot({
          provider: 'prisma',
          prismaClientFactory: () => client,
        }),
      ],
    }).compile();
    expect(module.get(ORM_PROVIDER)).toBe('prisma');
    expect(module.get(DATABASE_ADAPTER)).toBeInstanceOf(PrismaService);
    expect(module.get(MIGRATION_RUNNER)).toBeInstanceOf(PrismaMigrationRunner);
    expect(module.get(TRANSACTION_MANAGER)).toBeInstanceOf(
      PrismaTransactionManager,
    );
    expect(module.get(RepositoryFactory)).toBeInstanceOf(RepositoryFactory);
    expect(module.get(DatabaseHealthIndicator)).toBeInstanceOf(
      DatabaseHealthIndicator,
    );
    await expect(
      module.get<PrismaMigrationRunner>(MIGRATION_RUNNER).run(),
    ).rejects.toThrow('command executor');
    await module.close();
  });

  it('selects only TypeORM and supports ORM_TYPE fallback', async () => {
    const source = Object.assign(dataSource(), {
      runMigrations: jest.fn(),
      undoLastMigration: jest.fn(),
    });
    const module = await Test.createTestingModule({
      imports: [
        DatabaseInfrastructureModule.forRoot({
          env: { ORM_TYPE: 'typeorm' },
          typeOrmDataSourceFactory: () => source,
        }),
      ],
    }).compile();
    expect(module.get(ORM_PROVIDER)).toBe('typeorm');
    expect(module.get(DATABASE_ADAPTER)).toBeInstanceOf(TypeOrmService);
    expect(module.get(MIGRATION_RUNNER)).toBeInstanceOf(TypeOrmMigrationRunner);
    expect(module.get(TRANSACTION_MANAGER)).toBeInstanceOf(
      TypeOrmTransactionManager,
    );
    expect(module.get(RepositoryFactory)).toBeInstanceOf(RepositoryFactory);
    await module.close();
  });

  it('rejects unsupported providers and unsafe production config', () => {
    expect(() =>
      DatabaseInfrastructureModule.forRoot({
        env: { ORM_PROVIDER: 'unknown' },
      }),
    ).toThrow();
    expect(() =>
      DatabaseInfrastructureModule.forRoot({
        env: { NODE_ENV: 'production' },
      }),
    ).toThrow('Missing infrastructure configuration');
  });

  it('supports async options while loading only the selected client', async () => {
    const client = prisma();
    const module = await Test.createTestingModule({
      imports: [
        DatabaseInfrastructureModule.forRootAsync({
          useFactory: async () => ({
            provider: 'prisma',
            prismaClientFactory: () => client,
            healthTimeoutMs: 10,
          }),
        }),
      ],
    }).compile();
    expect(module.get(DATABASE_ADAPTER)).toBeInstanceOf(PrismaService);
    expect(module.get(MIGRATION_RUNNER)).toBeInstanceOf(PrismaMigrationRunner);
    await module.close();
  });

  it('supports asynchronous TypeORM selection and imports', async () => {
    const source = Object.assign(dataSource(), {
      migrations: [],
      runMigrations: jest.fn(),
      undoLastMigration: jest.fn(),
    });
    const module = await Test.createTestingModule({
      imports: [
        DatabaseInfrastructureModule.forRootAsync({
          imports: [EmptyImportedModule],
          inject: [],
          useFactory: () => ({
            env: { ORM_PROVIDER: 'typeorm' },
            typeOrmDataSourceFactory: () => source,
          }),
        }),
      ],
    }).compile();
    expect(module.get(ORM_PROVIDER)).toBe('typeorm');
    expect(module.get(DATABASE_ADAPTER)).toBeInstanceOf(TypeOrmService);
    expect(module.get(MIGRATION_RUNNER)).toBeInstanceOf(TypeOrmMigrationRunner);
    await module.close();
  });

  it('uses async default driver factories without loading both ORMs', async () => {
    const prismaConstructor = jest.fn(function Client(
      this: {
        $connect: PrismaClientLike['$connect'];
        $disconnect: PrismaClientLike['$disconnect'];
        $transaction: PrismaClientLike['$transaction'];
        $queryRaw: (
          query: TemplateStringsArray,
          ...values: unknown[]
        ) => Promise<unknown>;
        $queryRawUnsafe: (
          query: string,
          ...values: unknown[]
        ) => Promise<unknown>;
      },
      _options: unknown,
    ): void {
      Object.assign(this, {
        $connect: jest.fn().mockResolvedValue(undefined),
        $disconnect: jest.fn().mockResolvedValue(undefined),
        $transaction: jest.fn(
          async (work: (client: unknown) => Promise<unknown>) => work({}),
        ),
        $queryRaw: jest.fn().mockResolvedValue([{ one: 1 }]),
        $queryRawUnsafe: jest.fn().mockResolvedValue([{ one: 1 }]),
      });
    });
    const prismaModule = await Test.createTestingModule({
      imports: [
        DatabaseInfrastructureModule.forRootAsync({
          useFactory: () => ({
            provider: 'prisma',
            driverResolver: () => ({ PrismaClient: prismaConstructor }),
          }),
        }),
      ],
    }).compile();
    expect(prismaConstructor).toHaveBeenCalledTimes(1);
    await prismaModule.close();

    const typeOrmConstructor = jest.fn(function Source(
      this: DataSourceLike,
      _options: unknown,
    ): void {
      Object.assign(this, dataSource());
    });
    const typeOrmModule = await Test.createTestingModule({
      imports: [
        DatabaseInfrastructureModule.forRootAsync({
          useFactory: () => ({
            provider: 'typeorm',
            env: {
              DATABASE_HOST: 'host',
              DATABASE_NAME: 'db',
              DATABASE_USER: 'user',
              DATABASE_PASSWORD: 'secret',
            },
            driverResolver: () => ({ DataSource: typeOrmConstructor }),
          }),
        }),
      ],
    }).compile();
    expect(typeOrmConstructor).toHaveBeenCalledTimes(1);
    await typeOrmModule.close();
  });

  it('builds default module metadata without loading a driver', () => {
    const dynamic = DatabaseInfrastructureModule.forRoot();
    expect(dynamic.providers).toBeDefined();
  });

  it('uses hermetic default Prisma and TypeORM factories', async () => {
    const prismaConstructor = jest.fn(function Client(
      this: PrismaClientLike,
      _options: unknown,
    ): void {
      Object.assign(this, prisma());
    });
    const prismaModule = await Test.createTestingModule({
      imports: [
        DatabaseInfrastructureModule.forRoot({
          provider: 'prisma',
          driverResolver: () => ({ PrismaClient: prismaConstructor }),
        }),
      ],
    }).compile();
    expect(prismaModule.get(DATABASE_ADAPTER)).toBeInstanceOf(PrismaService);
    await prismaModule.close();

    const typeOrmConstructor = jest.fn(function Source(
      this: DataSourceLike,
      _options: unknown,
    ): void {
      Object.assign(this, dataSource());
    });
    const typeOrmModule = await Test.createTestingModule({
      imports: [
        DatabaseInfrastructureModule.forRoot({
          provider: 'typeorm',
          env: {
            DATABASE_HOST: 'host',
            DATABASE_NAME: 'db',
            DATABASE_USER: 'user',
            DATABASE_PASSWORD: 'secret',
          },
          driverResolver: () => ({ DataSource: typeOrmConstructor }),
        }),
      ],
    }).compile();
    expect(typeOrmModule.get(DATABASE_ADAPTER)).toBeInstanceOf(TypeOrmService);
    await typeOrmModule.close();
  });
});
