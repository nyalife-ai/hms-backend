/** Stable dependency-injection tokens shared by platform modules. */
export const ORM_PROVIDER = Symbol.for('platform.ORM_PROVIDER');
export const DATABASE_ADAPTER = Symbol.for('platform.DATABASE_ADAPTER');
export const REDIS_CLIENT = Symbol.for('platform.REDIS_CLIENT');
export const CACHE_SERVICE = Symbol.for('platform.CACHE_SERVICE');
export const ENCRYPTION_SERVICE = Symbol.for('platform.ENCRYPTION_SERVICE');
export const SECRET_PROVIDER = Symbol.for('platform.SECRET_PROVIDER');
export const AUDIT_SERVICE = Symbol.for('platform.AUDIT_SERVICE');
export const CLOCK = Symbol.for('platform.CLOCK');
export const MODULE_REGISTRY = Symbol.for('platform.MODULE_REGISTRY');
export const MIGRATION_RUNNER = Symbol.for('platform.MIGRATION_RUNNER');
export const PRISMA_CLIENT = Symbol.for('platform.PRISMA_CLIENT');
export const TYPEORM_DATA_SOURCE = Symbol.for('platform.TYPEORM_DATA_SOURCE');
