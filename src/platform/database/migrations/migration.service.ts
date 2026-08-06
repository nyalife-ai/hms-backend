import { Inject, Injectable } from '@nestjs/common';
import type {
  MigrationRunner,
  MigrationStatus,
} from '../contracts/migration-runner.interface';
import { MIGRATION_RUNNER } from '../providers/database.tokens';

@Injectable()
export class NoopMigrationRunner implements MigrationRunner {
  private applied = false;

  public async run(): Promise<void> {
    this.applied = true;
    await Promise.resolve();
  }

  public async revert(): Promise<void> {
    this.applied = false;
    await Promise.resolve();
  }

  public async status(): Promise<MigrationStatus> {
    await Promise.resolve();
    return this.applied
      ? { pending: [], applied: ['noop'] }
      : { pending: ['noop'], applied: [] };
  }
}

@Injectable()
export class MigrationService {
  public constructor(
    @Inject(MIGRATION_RUNNER) private readonly runner: MigrationRunner,
  ) {}

  public run(): Promise<void> {
    return this.runner.run();
  }

  public revert(): Promise<void> {
    return this.runner.revert();
  }

  public status(): Promise<MigrationStatus> {
    return this.runner.status();
  }
}
