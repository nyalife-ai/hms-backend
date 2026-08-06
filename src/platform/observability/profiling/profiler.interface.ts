export interface MemorySample {
  readonly heapUsedBytes: number;
  readonly residentSetBytes: number;
}

export interface ProfileRecord {
  readonly name: string;
  readonly durationMs: number;
  readonly memoryDeltaBytes: number;
  readonly slow: boolean;
  readonly failed: boolean;
}

export interface Profiler {
  measure<T>(name: string, operation: () => T | Promise<T>): Promise<T>;
}
