import type {
  DatabaseSeed,
  SeedRunner as SeedRunnerPort,
} from '../../../platform/database';
import { maskError } from '../../configuration';
import type { SeedResult, SeedTransaction, SeedUnit } from './seed.types';

const direct: SeedTransaction = async <T>(work: () => Promise<T>): Promise<T> =>
  work();

export class SeedRunner implements SeedRunnerPort {
  private readonly completed = new Set<string>();
  private recordedResults: readonly SeedResult[] = [];

  public constructor(private readonly transaction: SeedTransaction = direct) {}

  public get results(): readonly SeedResult[] {
    return this.recordedResults;
  }

  public async run(seeds: readonly DatabaseSeed[]): Promise<void> {
    const results: SeedResult[] = [];
    for (const seed of seeds as readonly SeedUnit[]) {
      if (
        (seed.idempotent === true && this.completed.has(seed.name)) ||
        (seed.shouldRun !== undefined && !(await seed.shouldRun()))
      ) {
        results.push({ name: seed.name, status: 'skipped' });
        continue;
      }
      try {
        await this.transaction(seed.run);
        this.completed.add(seed.name);
        results.push({ name: seed.name, status: 'completed' });
      } catch (error: unknown) {
        results.push({
          name: seed.name,
          status: 'failed',
          error: maskError(error),
        });
        this.recordedResults = Object.freeze(results);
        throw error;
      }
    }
    this.recordedResults = Object.freeze(results);
  }
}
