import { Injectable } from '@nestjs/common';
import { CircuitBreakerOpenError } from './circuit-breaker.types';
import type {
  CircuitBreakerOptions,
  CircuitBreakerState,
} from './circuit-breaker.types';

@Injectable()
export class CircuitBreaker {
  private currentState: CircuitBreakerState = 'closed';
  private failures = 0;
  private openedAt: number | undefined;
  private halfOpenTrialActive = false;

  public constructor(private readonly options: CircuitBreakerOptions) {
    if (
      !Number.isInteger(options.failureThreshold) ||
      options.failureThreshold < 1
    ) {
      throw new RangeError('failureThreshold must be a positive integer');
    }
    if (
      !Number.isFinite(options.resetTimeoutMs) ||
      options.resetTimeoutMs < 0
    ) {
      throw new RangeError('resetTimeoutMs must be a non-negative number');
    }
  }

  public get state(): CircuitBreakerState {
    this.advanceToHalfOpenWhenReady();
    return this.currentState;
  }

  public async execute<T>(operation: () => Promise<T> | T): Promise<T> {
    this.advanceToHalfOpenWhenReady();
    if (this.currentState === 'open') {
      throw new CircuitBreakerOpenError();
    }
    if (this.currentState === 'half-open') {
      if (this.halfOpenTrialActive) {
        throw new CircuitBreakerOpenError();
      }
      this.halfOpenTrialActive = true;
    }

    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (error: unknown) {
      this.recordFailure();
      throw error;
    }
  }

  private advanceToHalfOpenWhenReady(): void {
    if (
      this.currentState === 'open' &&
      this.openedAt !== undefined &&
      this.options.clock.timestamp() - this.openedAt >=
        this.options.resetTimeoutMs
    ) {
      this.transitionTo('half-open');
    }
  }

  private recordSuccess(): void {
    this.failures = 0;
    this.halfOpenTrialActive = false;
    if (this.currentState === 'half-open') {
      this.openedAt = undefined;
      this.transitionTo('closed');
    }
  }

  private recordFailure(): void {
    this.halfOpenTrialActive = false;
    if (this.currentState === 'half-open') {
      this.open();
      return;
    }
    this.failures += 1;
    if (this.failures >= this.options.failureThreshold) {
      this.open();
    }
  }

  private open(): void {
    this.openedAt = this.options.clock.timestamp();
    this.transitionTo('open');
  }

  private transitionTo(state: CircuitBreakerState): void {
    const previous = this.currentState;
    this.currentState = state;
    this.options.onStateChange?.(previous, state);
  }
}
