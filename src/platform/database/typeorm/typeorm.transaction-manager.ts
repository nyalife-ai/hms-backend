import { Injectable } from '@nestjs/common';
import type { UnitOfWork } from '../../../core';
import type { DataSourceLike, QueryRunnerLike } from './typeorm-client.types';

/**
 * Handle bound to a single QueryRunner transaction.
 * Concurrent begins on the root manager each get an independent handle.
 */
export class TypeOrmTransactionHandle implements UnitOfWork {
  private settled = false;

  public constructor(private readonly runner: QueryRunnerLike) {}

  public isSettled(): boolean {
    return this.settled;
  }

  public getQueryRunner(): QueryRunnerLike {
    return this.runner;
  }

  public execute<T>(work: (uow: UnitOfWork) => Promise<T>): Promise<T> {
    this.assertOpen();
    return work(this);
  }

  public begin(): Promise<UnitOfWork> {
    return Promise.reject(new Error('A TypeORM transaction is already active'));
  }

  public async commit(): Promise<void> {
    this.assertOpen();
    try {
      await this.runner.commitTransaction();
    } finally {
      this.settled = true;
      await this.runner.release();
    }
  }

  public async rollback(): Promise<void> {
    if (this.settled) {
      return;
    }
    this.settled = true;
    try {
      await this.runner.rollbackTransaction();
    } finally {
      await this.runner.release();
    }
  }

  private assertOpen(): void {
    if (this.settled) {
      throw new Error('No active TypeORM transaction');
    }
  }
}

/**
 * Root TypeORM unit of work. Does not keep a singleton mutable runner;
 * {@link begin} returns an explicit handle per transaction.
 */
@Injectable()
export class TypeOrmTransactionManager implements UnitOfWork {
  public constructor(private readonly dataSource: DataSourceLike) {}

  public async execute<T>(work: (uow: UnitOfWork) => Promise<T>): Promise<T> {
    const handle = await this.begin();
    try {
      const result = await work(handle);
      await handle.commit();
      return result;
    } catch (error: unknown) {
      await handle.rollback();
      throw error;
    }
  }

  public async begin(): Promise<TypeOrmTransactionHandle> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    return new TypeOrmTransactionHandle(runner);
  }

  public commit(): Promise<void> {
    return Promise.reject(
      new Error(
        'No active TypeORM transaction on the root manager; commit the handle from begin()',
      ),
    );
  }

  public rollback(): Promise<void> {
    return Promise.reject(
      new Error(
        'No active TypeORM transaction on the root manager; rollback the handle from begin()',
      ),
    );
  }
}
