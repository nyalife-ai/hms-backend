import { type HealthIndicator } from './health-indicator.interface';
import { type HealthIndicatorResult } from './health.types';

export type DependencyCheck = () =>
  | boolean
  | Readonly<Record<string, unknown>>
  | Promise<boolean | Readonly<Record<string, unknown>>>;

export class DependencyHealthIndicator implements HealthIndicator {
  public constructor(
    public readonly name: string,
    private readonly dependencyCheck: DependencyCheck,
  ) {
    if (name.trim() === '') throw new Error('Indicator name is required');
  }

  public async check(): Promise<HealthIndicatorResult> {
    const started = Date.now();
    try {
      const result = await this.dependencyCheck();
      const up = result !== false;
      return {
        name: this.name,
        status: up ? 'up' : 'down',
        ...(up || typeof result !== 'boolean'
          ? {}
          : { message: 'Dependency check returned false' }),
        ...(typeof result === 'object' ? { details: result } : {}),
        durationMs: Date.now() - started,
      };
    } catch (error: unknown) {
      return {
        name: this.name,
        status: 'down',
        message: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - started,
      };
    }
  }
}

export const createDependencyIndicator = (
  name: string,
  check: DependencyCheck,
): HealthIndicator => new DependencyHealthIndicator(name, check);
