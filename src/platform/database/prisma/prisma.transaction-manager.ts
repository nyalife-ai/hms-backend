import { Injectable } from '@nestjs/common';
import type { UnitOfWork } from '../../../core';
import { TransactionLifecycleNotSupportedError } from '../transactions/transaction-lifecycle.error';
import type { PrismaClientLike } from './prisma-client.types';

/**
 * Prisma unit of work backed solely by interactive `$transaction`.
 * Split begin/commit/rollback is not supported and always throws
 * {@link TransactionLifecycleNotSupportedError}.
 */
@Injectable()
export class PrismaTransactionManager implements UnitOfWork {
  public constructor(private readonly client: PrismaClientLike) {}

  public execute<T>(work: (uow: UnitOfWork) => Promise<T>): Promise<T> {
    return this.client.$transaction(async () => {
      const nested: UnitOfWork = {
        execute: <U>(inner: (uow: UnitOfWork) => Promise<U>): Promise<U> =>
          inner(nested),
        begin: (): Promise<UnitOfWork> =>
          Promise.reject(
            new TransactionLifecycleNotSupportedError(
              'Prisma does not support externally split begin/commit/rollback; use execute()',
            ),
          ),
        commit: (): Promise<void> =>
          Promise.reject(
            new TransactionLifecycleNotSupportedError(
              'Prisma does not support externally split begin/commit/rollback; use execute()',
            ),
          ),
        rollback: (): Promise<void> =>
          Promise.reject(
            new TransactionLifecycleNotSupportedError(
              'Prisma does not support externally split begin/commit/rollback; use execute()',
            ),
          ),
      };
      return work(nested);
    });
  }

  public begin(): Promise<UnitOfWork> {
    return Promise.reject(
      new TransactionLifecycleNotSupportedError(
        'Prisma does not support externally split begin/commit/rollback; use execute()',
      ),
    );
  }

  public commit(): Promise<void> {
    return Promise.reject(
      new TransactionLifecycleNotSupportedError(
        'Prisma does not support externally split begin/commit/rollback; use execute()',
      ),
    );
  }

  public rollback(): Promise<void> {
    return Promise.reject(
      new TransactionLifecycleNotSupportedError(
        'Prisma does not support externally split begin/commit/rollback; use execute()',
      ),
    );
  }
}
