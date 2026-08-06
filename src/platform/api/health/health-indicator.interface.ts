import { type HealthIndicatorResult } from './health.types';

export interface HealthIndicator {
  readonly name: string;
  check(): Promise<HealthIndicatorResult>;
}
