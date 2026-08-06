import type { Clock } from '../../../core';

export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  readonly failureThreshold: number;
  readonly resetTimeoutMs: number;
  readonly clock: Pick<Clock, 'timestamp'>;
  readonly onStateChange?: (
    previous: CircuitBreakerState,
    current: CircuitBreakerState,
  ) => void;
}

export class CircuitBreakerOpenError extends Error {
  public constructor() {
    super('Circuit breaker is open');
    this.name = 'CircuitBreakerOpenError';
  }
}
