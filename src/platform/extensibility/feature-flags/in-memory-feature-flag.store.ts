import { assertPositiveInteger } from '../../architecture/production-defaults';
import { FeatureFlagStore } from './feature-flag-store.interface';
import { FlagRule } from './feature-flag.types';

export interface InMemoryFeatureFlagStoreOptions {
  /** Maximum flag entries. Defaults to 10_000. */
  readonly maxEntries?: number;
}

export class InMemoryFeatureFlagStore implements FeatureFlagStore {
  private readonly flags = new Map<string, FlagRule>();
  private readonly maxEntries: number;

  public constructor(
    initial: Readonly<Record<string, FlagRule>> = {},
    options: InMemoryFeatureFlagStoreOptions = {},
  ) {
    this.maxEntries = assertPositiveInteger(
      options.maxEntries ?? 10_000,
      'InMemoryFeatureFlagStore maxEntries',
    );
    for (const [flag, rule] of Object.entries(initial)) {
      this.set(flag, rule);
    }
  }

  public get(flag: string): FlagRule | undefined {
    return this.flags.get(flag);
  }

  public set(flag: string, rule: FlagRule): void {
    if (flag.trim().length === 0) {
      throw new TypeError('Feature flag name must be non-empty');
    }
    if (
      rule.percentage !== undefined &&
      (!Number.isFinite(rule.percentage) ||
        rule.percentage < 0 ||
        rule.percentage > 100)
    ) {
      throw new RangeError('Feature flag percentage must be between 0 and 100');
    }
    if (!this.flags.has(flag) && this.flags.size >= this.maxEntries) {
      throw new RangeError(
        `InMemoryFeatureFlagStore is full (maxEntries=${this.maxEntries})`,
      );
    }
    this.flags.set(
      flag,
      Object.freeze({
        ...rule,
        users: rule.users ? Object.freeze([...rule.users]) : undefined,
        tenants: rule.tenants ? Object.freeze([...rule.tenants]) : undefined,
        environments: rule.environments
          ? Object.freeze([...rule.environments])
          : undefined,
      }),
    );
  }

  public delete(flag: string): boolean {
    return this.flags.delete(flag);
  }

  public entries(): ReadonlyMap<string, FlagRule> {
    return new Map(this.flags);
  }
}
