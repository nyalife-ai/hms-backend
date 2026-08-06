export type MigrationStatus = Readonly<{
  pending: readonly string[];
  applied: readonly string[];
}>;

export interface MigrationRunner {
  run(): Promise<void>;
  revert(): Promise<void>;
  status(): Promise<MigrationStatus>;
}
