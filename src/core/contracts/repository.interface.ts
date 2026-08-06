/**
 * Generic repository ports — implemented by Prisma / TypeORM adapters in platform.
 *
 * Core never imports an ORM. Persistence adapters fulfil these contracts.
 */

export interface ReadableRepository<T, TId> {
  findById(id: TId): Promise<T | null>;
  findAll(criteria?: unknown): Promise<T[]>;
  exists(id: TId): Promise<boolean>;
}

export interface WritableRepository<T, TId> {
  save(entity: T): Promise<T>;
  delete(id: TId): Promise<void>;
}

/**
 * Full repository port combining read and write capabilities.
 */
export interface Repository<T, TId>
  extends ReadableRepository<T, TId>, WritableRepository<T, TId> {}
