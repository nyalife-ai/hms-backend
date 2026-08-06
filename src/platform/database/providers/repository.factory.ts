import { Injectable, type InjectionToken } from '@nestjs/common';
import type { Repository } from '../../../core';
import type { OrmProvider } from './orm.types';

export type RepositoryBuilder<T, TId> = () => Repository<T, TId>;

/** Registry that selects repository implementations without leaking an ORM. */
@Injectable()
export class RepositoryFactory {
  private readonly builders = new Map<
    InjectionToken,
    Readonly<Partial<Record<OrmProvider, RepositoryBuilder<unknown, unknown>>>>
  >();

  public register<T, TId>(
    token: InjectionToken,
    provider: OrmProvider,
    builder: RepositoryBuilder<T, TId>,
  ): void {
    const current = this.builders.get(token) ?? {};
    this.builders.set(token, {
      ...current,
      [provider]: builder as RepositoryBuilder<unknown, unknown>,
    });
  }

  public create<T, TId>(
    token: InjectionToken,
    provider: OrmProvider,
  ): Repository<T, TId> {
    const builder = this.builders.get(token)?.[provider];
    if (builder === undefined) {
      throw new Error(
        `No ${provider} repository registered for ${String(token)}`,
      );
    }
    return builder() as Repository<T, TId>;
  }
}
