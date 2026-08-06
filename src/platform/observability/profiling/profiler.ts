import {
  MemorySample,
  ProfileRecord,
  Profiler as ProfilerContract,
} from './profiler.interface';

export class Profiler implements ProfilerContract {
  private readonly records: ProfileRecord[] = [];

  public constructor(
    private readonly slowThresholdMs: number = 1_000,
    private readonly now: () => number = (): number =>
      Number(process.hrtime.bigint()) / 1_000_000,
    private readonly sampleMemory: () => MemorySample = (): MemorySample => {
      const usage = process.memoryUsage();
      return {
        heapUsedBytes: usage.heapUsed,
        residentSetBytes: usage.rss,
      };
    },
  ) {
    if (!Number.isFinite(slowThresholdMs) || slowThresholdMs < 0) {
      throw new Error('Slow threshold must be a non-negative finite number');
    }
  }

  public async measure<T>(
    name: string,
    operation: () => T | Promise<T>,
  ): Promise<T> {
    if (name.trim().length === 0) {
      throw new Error('Profile name must not be empty');
    }
    const startedAt = this.now();
    const memoryBefore = this.sampleMemory();
    let failed = false;
    try {
      return await operation();
    } catch (error: unknown) {
      failed = true;
      throw error;
    } finally {
      const durationMs = Math.max(0, this.now() - startedAt);
      const memoryAfter = this.sampleMemory();
      this.records.push(
        Object.freeze({
          name,
          durationMs,
          memoryDeltaBytes:
            memoryAfter.heapUsedBytes - memoryBefore.heapUsedBytes,
          slow: durationMs > this.slowThresholdMs,
          failed,
        }),
      );
    }
  }

  public list(): readonly ProfileRecord[] {
    return Object.freeze([...this.records]);
  }

  public slowOperations(): readonly ProfileRecord[] {
    return Object.freeze(
      this.records.filter((record: ProfileRecord): boolean => record.slow),
    );
  }

  public clear(): void {
    this.records.length = 0;
  }
}
