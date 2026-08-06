export type DatabaseSeed = Readonly<{
  name: string;
  run: () => Promise<void>;
}>;

export interface SeedRunner {
  run(seeds: readonly DatabaseSeed[]): Promise<void>;
}
