import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial TypeORM migration scaffold.
 *
 * Replace the empty `up` / `down` bodies with your schema DDL, or generate
 * a new migration from entities:
 *
 *   npm run migration:generate -- src/database/migrations/AddResources
 *
 * Keep synchronize=false and always ship schema changes as migrations.
 */
export class InitialSchema1773464660676 implements MigrationInterface {
  name = 'InitialSchema1773464660676';

  public async up(queryRunner: QueryRunner): Promise<void> {
    void queryRunner;
    await Promise.resolve();
    // Example:
    // await queryRunner.query(`
    //   CREATE TABLE IF NOT EXISTS "resources" (
    //     "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    //     "name" varchar(255) NOT NULL,
    //     "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    //     "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
    //   );
    // `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    void queryRunner;
    await Promise.resolve();
    // Example:
    // await queryRunner.query(`DROP TABLE IF EXISTS "resources";`);
  }
}
