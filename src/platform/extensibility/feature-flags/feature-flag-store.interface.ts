import { FlagRule } from './feature-flag.types';

export const FEATURE_FLAG_STORE = Symbol('FEATURE_FLAG_STORE');

export interface FeatureFlagStore {
  get(flag: string): FlagRule | undefined;
  set(flag: string, rule: FlagRule): void;
  delete(flag: string): boolean;
  entries(): ReadonlyMap<string, FlagRule>;
}
