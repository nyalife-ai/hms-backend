import type {
  MigrationRunner,
  MigrationStatus,
} from '../../../platform/database';

export interface TypeOrmMigrationDataSource {
  readonly migrations?: readonly Readonly<{ name?: string }>[];
  runMigrations(): Promise<unknown>;
  undoLastMigration(): Promise<unknown>;
  getAppliedMigrations?(): Promise<readonly Readonly<{ name?: string }>[]>;
}

export class TypeOrmMigrationRunner implements MigrationRunner {
  public constructor(private readonly dataSource: TypeOrmMigrationDataSource) {}

  public async run(): Promise<void> {
    await this.dataSource.runMigrations();
  }

  public async revert(): Promise<void> {
    await this.dataSource.undoLastMigration();
  }

  public async status(): Promise<MigrationStatus> {
    const available = (this.dataSource.migrations ?? [])
      .map((migration) => migration.name)
      .filter((name): name is string => name !== undefined);
    const applied =
      this.dataSource.getAppliedMigrations === undefined
        ? []
        : (await this.dataSource.getAppliedMigrations())
            .map((migration) => migration.name)
            .filter((name): name is string => name !== undefined);
    const appliedSet = new Set(applied);
    return {
      applied,
      pending: available.filter((name) => !appliedSet.has(name)),
    };
  }
}
