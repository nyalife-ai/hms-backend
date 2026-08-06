import { Clock, IdentifierGenerator } from '../../core';

export type MockFunction<TArgs extends readonly unknown[], TResult> = ((
  ...args: TArgs
) => TResult) & {
  readonly calls: TArgs[];
};

export function createMock<T extends object>(overrides: Partial<T> = {}): T {
  return { ...overrides } as T;
}

export function mockFn<TArgs extends readonly unknown[], TResult>(
  implementation: (...args: TArgs) => TResult,
): MockFunction<TArgs, TResult> {
  const calls: TArgs[] = [];
  const fn = ((...args: TArgs): TResult => {
    calls.push(args);
    return implementation(...args);
  }) as MockFunction<TArgs, TResult>;
  Object.defineProperty(fn, 'calls', { value: calls, enumerable: true });
  return fn;
}

export function mockReturnValue<TResult>(
  value: TResult,
): MockFunction<readonly unknown[], TResult> {
  return mockFn((): TResult => value);
}

export class FakeClock implements Clock {
  private current: Date;

  public constructor(initial: Date = new Date(0)) {
    this.current = new Date(initial);
  }

  public now(): Date {
    return new Date(this.current);
  }

  public timestamp(): number {
    return this.current.getTime();
  }

  public set(instant: Date): void {
    this.current = new Date(instant);
  }

  public advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

export class FixedIdGenerator<
  TId = string,
> implements IdentifierGenerator<TId> {
  public constructor(private readonly value: TId) {}

  public next(): TId {
    return this.value;
  }
}
