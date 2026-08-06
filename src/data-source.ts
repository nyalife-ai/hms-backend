/**
 * TypeORM CLI entrypoint.
 *
 * package.json scripts point here (`-d src/data-source.ts`).
 * The real configuration lives in `src/database/typeorm.config.ts` so the
 * NestJS DatabaseModule and the CLI share a single source of truth.
 */
export { AppDataSource } from './database/typeorm.config';
