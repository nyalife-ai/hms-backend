export interface FlagRule {
  readonly enabled: boolean;
  readonly users?: readonly string[];
  readonly tenants?: readonly string[];
  readonly percentage?: number;
  readonly environments?: readonly string[];
}

export interface FeatureFlagContext {
  readonly userId?: string;
  readonly tenantId?: string;
  readonly environment?: string;
}
