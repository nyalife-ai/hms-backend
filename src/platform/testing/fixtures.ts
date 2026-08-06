export type FixtureFactory<T> = () => T;

export interface FixtureBuilder<T> {
  build(overrides?: Partial<T>): T;
  buildMany(count: number, overrides?: Partial<T>): T[];
}

export function define<T extends object>(
  factory: FixtureFactory<T>,
): FixtureBuilder<T> {
  return {
    build: (overrides: Partial<T> = {}): T => ({
      ...factory(),
      ...overrides,
    }),
    buildMany: (count: number, overrides: Partial<T> = {}): T[] => {
      if (!Number.isInteger(count) || count < 0) {
        throw new RangeError('Fixture count must be a non-negative integer');
      }
      return Array.from({ length: count }, (): T => ({
        ...factory(),
        ...overrides,
      }));
    },
  };
}
