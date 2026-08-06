import { Test } from '@nestjs/testing';
import type { Repository } from '../../../core';
import { ConflictException } from '../../../core';
import {
  DATABASE_ADAPTER,
  DatabaseHealthService,
  DatabaseModule,
  MigrationService,
  NoopMigrationRunner,
  PrismaAdapter,
  PrismaTransactionManager,
  RepositoryFactory,
  SlowQueryDetector,
  TRANSACTION_MANAGER,
  TransactionLifecycleNotSupportedError,
  TypeOrmAdapter,
  TypeOrmTransactionHandle,
  TypeOrmTransactionManager,
  applySoftDeleteFilter,
  assertVersion,
  bumpVersion,
  isDeleted,
  markDeleted,
  mergePoolOptions,
  resolveOrmProvider,
  resolveReadReplicaUrl,
  type DataSourceLike,
  type MigrationRunner,
  type PrismaClientLike,
  type QueryRunnerLike,
} from '..';

const prismaMock = (queryFailure?: unknown): PrismaClientLike => ({
  $connect: jest.fn(async (): Promise<void> => undefined),
  $disconnect: jest.fn(async (): Promise<void> => undefined),
  $transaction: async <T>(work: (client: unknown) => Promise<T>): Promise<T> =>
    work({}),
  healthCheck: jest.fn(async (): Promise<unknown> => {
    if (queryFailure !== undefined) {
      throw queryFailure;
    }
    return [{ result: 1 }];
  }),
  queryRaw: jest.fn(async (): Promise<unknown> => {
    if (queryFailure !== undefined) {
      throw queryFailure;
    }
    return [{ result: 1 }];
  }),
});

type RunnerSpies = QueryRunnerLike & {
  connect: jest.Mock<Promise<void>, []>;
  startTransaction: jest.Mock<Promise<void>, []>;
  commitTransaction: jest.Mock<Promise<void>, []>;
  rollbackTransaction: jest.Mock<Promise<void>, []>;
  release: jest.Mock<Promise<void>, []>;
};

const runnerMock = (): RunnerSpies => ({
  connect: jest.fn(async (): Promise<void> => undefined),
  startTransaction: jest.fn(async (): Promise<void> => undefined),
  commitTransaction: jest.fn(async (): Promise<void> => undefined),
  rollbackTransaction: jest.fn(async (): Promise<void> => undefined),
  release: jest.fn(async (): Promise<void> => undefined),
  query: jest.fn(async (): Promise<unknown> => undefined),
});

const typeOrmMock = (
  createRunner: () => QueryRunnerLike = runnerMock,
  queryFailure?: unknown,
  initialized = true,
): DataSourceLike => ({
  isInitialized: initialized,
  initialize: jest.fn(async (): Promise<unknown> => ({})),
  destroy: jest.fn(async (): Promise<void> => undefined),
  query: jest.fn(async (): Promise<unknown> => {
    if (queryFailure !== undefined) {
      throw queryFailure;
    }
    return [{ result: 1 }];
  }),
  createQueryRunner: (): QueryRunnerLike => createRunner(),
});

describe('database platform', () => {
  describe('ORM resolution and module wiring', () => {
    it('resolves precedence, fallback, normalization, defaults, and errors', () => {
      expect(
        resolveOrmProvider({ ORM_PROVIDER: ' TypeORM ', ORM_TYPE: 'prisma' }),
      ).toBe('typeorm');
      expect(resolveOrmProvider({ ORM_TYPE: 'PRISMA' })).toBe('prisma');
      expect(resolveOrmProvider({})).toBe('prisma');
      expect(() => resolveOrmProvider({ ORM_PROVIDER: 'mongo' })).toThrow(
        'Unsupported ORM provider',
      );
    });

    it('wires only Prisma providers', async () => {
      const client = prismaMock();
      const moduleRef = await Test.createTestingModule({
        imports: [
          DatabaseModule.forRoot({
            provider: 'prisma',
            prismaClientFactory: () => client,
          }),
        ],
      }).compile();
      expect(moduleRef.get(DATABASE_ADAPTER)).toBeInstanceOf(PrismaAdapter);
      expect(moduleRef.get(TRANSACTION_MANAGER)).toBeInstanceOf(
        PrismaTransactionManager,
      );
      await moduleRef.close();
    });

    it('wires only TypeORM providers and accepts a migration runner', async () => {
      const customRunner: MigrationRunner = {
        run: jest.fn(async (): Promise<void> => undefined),
        revert: jest.fn(async (): Promise<void> => undefined),
        status: jest.fn(async () => ({ pending: [], applied: [] })),
      };
      const moduleRef = await Test.createTestingModule({
        imports: [
          DatabaseModule.forRoot({
            env: { ORM_PROVIDER: 'typeorm' },
            typeOrmDataSourceFactory: () => typeOrmMock(),
            migrationRunner: customRunner,
          }),
        ],
      }).compile();
      expect(moduleRef.get(DATABASE_ADAPTER)).toBeInstanceOf(TypeOrmAdapter);
      expect(moduleRef.get(TRANSACTION_MANAGER)).toBeInstanceOf(
        TypeOrmTransactionManager,
      );
      expect(moduleRef.get(MigrationService)).toBeInstanceOf(MigrationService);
      await moduleRef.close();
    });

    it('requires the selected client factory', () => {
      expect(() => DatabaseModule.forRoot()).toThrow('prismaClientFactory');
      expect(() => DatabaseModule.forRoot({ provider: 'prisma' })).toThrow(
        'prismaClientFactory',
      );
      expect(() => DatabaseModule.forRoot({ provider: 'typeorm' })).toThrow(
        'typeOrmDataSourceFactory',
      );
    });

    it('fails fast in production when only NoopMigrationRunner is configured', () => {
      expect(() =>
        DatabaseModule.forRoot({
          provider: 'prisma',
          prismaClientFactory: () => prismaMock(),
          isProduction: true,
        }),
      ).toThrow('migrationRunner is required in production');
      expect(() =>
        DatabaseModule.forRoot({
          provider: 'prisma',
          prismaClientFactory: () => prismaMock(),
          isProduction: true,
          migrationRunner: new NoopMigrationRunner(),
        }),
      ).toThrow('migrationRunner is required in production');
      expect(() =>
        DatabaseModule.forRoot({
          provider: 'prisma',
          prismaClientFactory: () => prismaMock(),
          isProduction: true,
          allowNoopMigrations: true,
        }),
      ).not.toThrow();
    });
  });

  describe('Prisma adapter and unit of work', () => {
    it('connects, disconnects, transacts, and reports health', async () => {
      const client = prismaMock();
      const adapter = new PrismaAdapter(client);
      await adapter.connect();
      await adapter.disconnect();
      const txClient = { marker: 'prisma-tx' };
      client.$transaction = async <T>(
        work: (client: unknown) => Promise<T>,
      ): Promise<T> => work(txClient);
      await expect(
        adapter.transaction(async (tx) => {
          expect(tx).toBe(txClient);
          return 42;
        }),
      ).resolves.toBe(42);
      await expect(adapter.healthCheck()).resolves.toMatchObject({
        status: 'up',
      });
      expect(client.$connect).toHaveBeenCalled();
      expect(client.$disconnect).toHaveBeenCalled();
      expect(client.healthCheck).toHaveBeenCalled();
    });

    it('falls back through queryRaw and connect, and reports failures', async () => {
      const queryOnly: PrismaClientLike = {
        $connect: jest.fn(async (): Promise<void> => undefined),
        $disconnect: jest.fn(async (): Promise<void> => undefined),
        $transaction: async <T>(
          work: (client: unknown) => Promise<T>,
        ): Promise<T> => work({}),
        queryRaw: jest.fn(async (): Promise<unknown> => [{ result: 1 }]),
      };
      await expect(
        new PrismaAdapter(queryOnly).healthCheck(),
      ).resolves.toMatchObject({ status: 'up' });
      expect(queryOnly.queryRaw).toHaveBeenCalledWith('SELECT 1');

      const noQuery = prismaMock();
      noQuery.healthCheck = undefined;
      noQuery.queryRaw = undefined;
      await expect(
        new PrismaAdapter(noQuery).healthCheck(),
      ).resolves.toMatchObject({
        status: 'up',
      });
      await expect(
        new PrismaAdapter(prismaMock(new Error('offline'))).healthCheck(),
      ).resolves.toMatchObject({
        status: 'down',
        details: { error: 'offline' },
      });
      await expect(
        new PrismaAdapter(prismaMock('offline')).healthCheck(),
      ).resolves.toMatchObject({
        status: 'down',
        details: { error: 'offline' },
      });
    });

    it('executes real callback transactions and rejects split lifecycle', async () => {
      const client = prismaMock();
      const manager = new PrismaTransactionManager(client);
      await expect(
        manager.execute(async (uow) => {
          await expect(uow.execute(async () => 'nested')).resolves.toBe(
            'nested',
          );
          await expect(uow.begin()).rejects.toBeInstanceOf(
            TransactionLifecycleNotSupportedError,
          );
          await expect(uow.commit()).rejects.toBeInstanceOf(
            TransactionLifecycleNotSupportedError,
          );
          await expect(uow.rollback()).rejects.toBeInstanceOf(
            TransactionLifecycleNotSupportedError,
          );
          return 'done';
        }),
      ).resolves.toBe('done');
      expect(client.$transaction).toBeDefined();
      await expect(manager.begin()).rejects.toBeInstanceOf(
        TransactionLifecycleNotSupportedError,
      );
      await expect(manager.commit()).rejects.toBeInstanceOf(
        TransactionLifecycleNotSupportedError,
      );
      await expect(manager.rollback()).rejects.toBeInstanceOf(
        TransactionLifecycleNotSupportedError,
      );
      expect(new TransactionLifecycleNotSupportedError().name).toBe(
        'TransactionLifecycleNotSupportedError',
      );
    });
  });

  describe('TypeORM adapter and unit of work', () => {
    it('manages connection lifecycle, commit, rollback, and health', async () => {
      const runners = [runnerMock(), runnerMock()];
      let index = 0;
      const source = typeOrmMock(
        () => runners[index++] ?? runnerMock(),
        undefined,
        false,
      );
      const adapter = new TypeOrmAdapter(source);
      await adapter.connect();
      await adapter.disconnect();
      await expect(
        adapter.transaction(async (tx) => {
          expect(tx).toBe(runners[0]);
          return 'ok';
        }),
      ).resolves.toBe('ok');
      expect(runners[0]?.commitTransaction).toHaveBeenCalled();
      await expect(
        adapter.transaction(async () => {
          throw new Error('failed');
        }),
      ).rejects.toThrow('failed');
      expect(runners[1]?.rollbackTransaction).toHaveBeenCalled();
      expect(runners[0]?.release).toHaveBeenCalled();
      expect(runners[1]?.release).toHaveBeenCalled();
      await expect(adapter.healthCheck()).resolves.toMatchObject({
        status: 'up',
      });
    });

    it('skips redundant lifecycle calls and reports health failures', async () => {
      const initialized = typeOrmMock(runnerMock, undefined, true);
      await new TypeOrmAdapter(initialized).connect();
      expect(initialized.initialize).not.toHaveBeenCalled();
      const stopped = typeOrmMock(runnerMock, undefined, false);
      await new TypeOrmAdapter(stopped).disconnect();
      expect(stopped.destroy).not.toHaveBeenCalled();
      const started = typeOrmMock(runnerMock, undefined, true);
      await new TypeOrmAdapter(started).disconnect();
      expect(started.destroy).toHaveBeenCalledTimes(1);
      await expect(
        new TypeOrmAdapter(
          typeOrmMock(runnerMock, new Error('down')),
        ).healthCheck(),
      ).resolves.toMatchObject({ status: 'down', details: { error: 'down' } });
      await expect(
        new TypeOrmAdapter(typeOrmMock(runnerMock, 'down')).healthCheck(),
      ).resolves.toMatchObject({ status: 'down', details: { error: 'down' } });
    });

    it('uses explicit handles and isolates concurrent transactions', async () => {
      const firstRunner = runnerMock();
      const secondRunner = runnerMock();
      const runners = [firstRunner, secondRunner, runnerMock(), runnerMock()];
      let index = 0;
      const manager = new TypeOrmTransactionManager(
        typeOrmMock(() => runners[index++] ?? runnerMock()),
      );

      await expect(manager.commit()).rejects.toThrow('root manager');
      await expect(manager.rollback()).rejects.toThrow('root manager');

      const first = await manager.begin();
      const second = await manager.begin();
      expect(first).toBeInstanceOf(TypeOrmTransactionHandle);
      expect(second).toBeInstanceOf(TypeOrmTransactionHandle);
      expect(first.getQueryRunner()).toBe(firstRunner);
      expect(second.getQueryRunner()).toBe(secondRunner);
      expect(first.isSettled()).toBe(false);

      await expect(first.begin()).rejects.toThrow('already active');
      await expect(first.execute(async () => 'nested')).resolves.toBe('nested');

      await second.rollback();
      expect(second.isSettled()).toBe(true);
      expect(secondRunner.rollbackTransaction).toHaveBeenCalled();
      expect(secondRunner.release).toHaveBeenCalled();
      expect(firstRunner.commitTransaction).not.toHaveBeenCalled();
      expect(firstRunner.rollbackTransaction).not.toHaveBeenCalled();

      await first.commit();
      expect(firstRunner.commitTransaction).toHaveBeenCalled();
      expect(firstRunner.release).toHaveBeenCalled();
      expect(secondRunner.commitTransaction).not.toHaveBeenCalled();

      await expect(first.commit()).rejects.toThrow('No active');
      await second.rollback();

      await expect(manager.execute(async () => 9)).resolves.toBe(9);
      await expect(
        manager.execute(async () => {
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');
    });
  });

  describe('services and factories', () => {
    it('delegates health checks and migrations', async () => {
      const adapter = new PrismaAdapter(prismaMock());
      const health = new DatabaseHealthService(adapter);
      await expect(health.check()).resolves.toMatchObject({ status: 'up' });

      const runner = new NoopMigrationRunner();
      const migrations = new MigrationService(runner);
      await expect(migrations.status()).resolves.toEqual({
        pending: ['noop'],
        applied: [],
      });
      await migrations.run();
      await expect(migrations.status()).resolves.toEqual({
        pending: [],
        applied: ['noop'],
      });
      await migrations.revert();
      await expect(migrations.status()).resolves.toEqual({
        pending: ['noop'],
        applied: [],
      });
    });

    it('registers and resolves ORM-specific repositories', async () => {
      type Item = Readonly<{ id: string }>;
      const repository: Repository<Item, string> = {
        findById: async (id: string): Promise<Item> => ({ id }),
        findAll: async (): Promise<Item[]> => [],
        exists: async (): Promise<boolean> => true,
        save: async (entity: Item): Promise<Item> => entity,
        delete: async (): Promise<void> => undefined,
      };
      const factory = new RepositoryFactory();
      const token = Symbol('items');
      factory.register(token, 'prisma', () => repository);
      expect(factory.create<Item, string>(token, 'prisma')).toBe(repository);
      await expect(repository.findById('1')).resolves.toEqual({ id: '1' });
      expect(() => factory.create(token, 'typeorm')).toThrow(
        'No typeorm repository',
      );
    });
  });

  describe('persistence helpers', () => {
    it('handles soft deletion without mutating input', () => {
      const active = { id: 'a', deletedAt: null };
      const deletedAt = new Date('2026-01-01T00:00:00.000Z');
      const deleted = markDeleted(active, deletedAt);
      expect(deleted).toEqual({ ...active, deletedAt });
      expect(active.deletedAt).toBeNull();
      expect(isDeleted(active)).toBe(false);
      expect(isDeleted(deleted)).toBe(true);
      expect(isDeleted({ deletedAt: '2026-01-01' })).toBe(true);
      expect(isDeleted({ deletedAt: 1 })).toBe(true);
      expect(applySoftDeleteFilter([active, deleted])).toEqual([active]);
      expect(markDeleted({ id: 'b' }).deletedAt).toBeInstanceOf(Date);
    });

    it('checks and increments optimistic versions', () => {
      const record = { id: 'a', version: 2 };
      expect(() => assertVersion(record, 2)).not.toThrow();
      expect(bumpVersion(record)).toEqual({ id: 'a', version: 3 });
      expect(() => assertVersion(record, 1)).toThrow(ConflictException);
      try {
        assertVersion(record, 1);
      } catch (error: unknown) {
        expect(error).toMatchObject({ code: 'OPTIMISTIC_LOCK_CONFLICT' });
      }
    });

    it('merges and validates pool options', () => {
      expect(mergePoolOptions()).toEqual({
        min: 0,
        max: 10,
        acquireTimeoutMs: 30_000,
        idleTimeoutMs: 10_000,
      });
      expect(mergePoolOptions({ min: 2, max: 4 })).toMatchObject({
        min: 2,
        max: 4,
      });
      for (const options of [
        { min: -1 },
        { max: 0 },
        { min: 3, max: 2 },
        { acquireTimeoutMs: -1 },
        { idleTimeoutMs: -1 },
      ]) {
        expect(() => mergePoolOptions(options)).toThrow(
          'Invalid connection pool options',
        );
      }
    });

    it('detects slow queries and validates thresholds', async () => {
      const callback = jest.fn(async (): Promise<void> => undefined);
      const detector = new SlowQueryDetector(10, callback);
      await expect(
        detector.inspect({ query: 'fast', durationMs: 9 }),
      ).resolves.toBe(false);
      await expect(
        detector.inspect({ query: 'slow', durationMs: 10 }),
      ).resolves.toBe(true);
      await detector.onSlowQuery({ query: 'direct', durationMs: 20 });
      expect(callback).toHaveBeenCalledTimes(2);
      await expect(
        new SlowQueryDetector().inspect({ query: 'fast', durationMs: 1 }),
      ).resolves.toBe(false);
      await expect(
        new SlowQueryDetector().inspect({
          query: 'default',
          durationMs: 1_000,
        }),
      ).resolves.toBe(true);
      expect(() => new SlowQueryDetector(-1)).toThrow('must not be negative');
    });

    it('resolves read replicas with controlled primary fallback', () => {
      expect(resolveReadReplicaUrl({ url: ' replica ' }, 'primary')).toBe(
        'replica',
      );
      expect(resolveReadReplicaUrl({}, 'primary')).toBe('primary');
      expect(
        resolveReadReplicaUrl(
          { url: ' ', fallbackToPrimary: false },
          'primary',
        ),
      ).toBeUndefined();
      expect(resolveReadReplicaUrl({})).toBeUndefined();
    });
  });
});
