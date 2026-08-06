import { createHash } from 'node:crypto';
import { FeatureFlagStore } from './feature-flag-store.interface';
import { FeatureFlagContext } from './feature-flag.types';

export class FeatureFlagService {
  public constructor(private readonly store: FeatureFlagStore) {}

  public isEnabled(flag: string, context: FeatureFlagContext = {}): boolean {
    const rule = this.store.get(flag);
    if (!rule?.enabled) {
      return false;
    }
    if (
      rule.users &&
      (!context.userId || !rule.users.includes(context.userId))
    ) {
      return false;
    }
    if (
      rule.tenants &&
      (!context.tenantId || !rule.tenants.includes(context.tenantId))
    ) {
      return false;
    }
    if (
      rule.environments &&
      (!context.environment || !rule.environments.includes(context.environment))
    ) {
      return false;
    }
    if (rule.percentage === undefined || rule.percentage === 100) {
      return true;
    }
    if (rule.percentage === 0 || !context.userId) {
      return false;
    }
    const digest = createHash('sha256')
      .update(`${context.userId}:${flag}`)
      .digest();
    const bucket = digest.readUInt32BE(0) % 10_000;
    return bucket < rule.percentage * 100;
  }
}
