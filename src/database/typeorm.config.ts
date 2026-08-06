import { DataSource, DataSourceOptions } from 'typeorm';
import { config as loadEnv } from 'dotenv';

/**
 * Load environment variables from .env.
 * Required because the TypeORM CLI executes this file directly,
 * bypassing NestJS ConfigModule initialisation.
 */
loadEnv();

/**
 * Shared TypeORM DataSource options.
 * Used by both the NestJS runtime (via DatabaseModule) and the TypeORM CLI
 * (via `src/data-source.ts` re-export).
 */
export const typeOrmDataSourceOptions: DataSourceOptions = {
  type: (process.env.DB_TYPE as 'postgres' | 'mysql' | 'sqlite') || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'app_db',

  /**
   * Glob patterns so new module entities and migrations are picked up
   * automatically without editing this file.
   */
  entities: [__dirname + '/../modules/**/entities/*{.js,.ts}'],
  migrations: [__dirname + '/migrations/**/*{.js,.ts}'],

  /**
   * synchronize MUST stay false — schema changes go through migrations.
   * migrationsRun is false so deploys run migrations explicitly via CLI.
   */
  synchronize: false,
  migrationsRun: false,

  logging: process.env.NODE_ENV !== 'production',
};

/**
 * CLI / programmatic DataSource instance.
 * Referenced by package.json scripts:
 *   npm run migration:run   → typeorm migration:run -d src/data-source.ts
 */
export const AppDataSource = new DataSource(typeOrmDataSourceOptions);
