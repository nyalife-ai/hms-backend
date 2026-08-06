export type QueryInformation = Readonly<{
  query: string;
  durationMs: number;
  parameters?: readonly unknown[];
}>;

export interface QueryLogger {
  logQuery(information: QueryInformation): void | Promise<void>;
}

export interface SlowQueryDetectorHook {
  onSlowQuery(information: QueryInformation): void | Promise<void>;
}
