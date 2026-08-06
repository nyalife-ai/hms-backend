import type {
  MigrationRunner,
  MigrationStatus,
} from '../../../platform/database';

export interface CommandExecutor {
  execute(command: string, args: readonly string[]): Promise<string>;
}

export type MigrationStatusParser = (output: string) => MigrationStatus;

/**
 * Thrown when an operation is intentionally unsupported by this runner.
 * Used instead of destructive fallbacks (e.g. `prisma migrate reset`).
 */
export class NotSupportedError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'NotSupportedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const defaultStatusParser: MigrationStatusParser = (output) => {
  const parsed = JSON.parse(output) as Readonly<{
    pending?: readonly string[];
    applied?: readonly string[];
  }>;
  return {
    pending: parsed.pending ?? [],
    applied: parsed.applied ?? [],
  };
};

export class PrismaMigrationRunner implements MigrationRunner {
  public constructor(
    private readonly executor: CommandExecutor,
    private readonly statusParser: MigrationStatusParser = defaultStatusParser,
  ) {}

  public async run(): Promise<void> {
    await this.executor.execute('prisma', ['migrate', 'deploy']);
  }

  /**
   * Prisma has no safe one-step "down" via this runner.
   * Do not call `migrate reset` — that would destroy the database.
   */
  public revert(): Promise<void> {
    return Promise.reject(
      new NotSupportedError(
        'Prisma has no simple down migration via PrismaMigrationRunner; ' +
          'use a dedicated migrate resolve / manual rollback strategy instead of reset',
      ),
    );
  }

  public async status(): Promise<MigrationStatus> {
    const output = await this.executor.execute('prisma', [
      'migrate',
      'status',
      '--json',
    ]);
    return this.statusParser(output);
  }
}
