/**
 * Typed Result — encode expected failures without throwing.
 *
 * Prefer Result for recoverable / domain-expected outcomes.
 * Prefer exceptions for unexpected infrastructure failures.
 *
 * ## Mapper throw semantics
 *
 * {@link Result.map}, {@link Result.mapError}, and {@link Result.flatMap}
 * intentionally do **not** catch exceptions thrown by the mapper callback.
 * If a mapper throws, the exception propagates to the caller — Results encode
 * expected domain failures, not programmer errors or unexpected throws.
 * Wrap fallible mappers yourself (or use a helper such as `fromThrowable`)
 * when you need throw-to-failure conversion.
 */

export type ResultFailure<E> = {
  readonly error: E;
};

export class Result<T, E = string> {
  private constructor(
    private readonly _isSuccess: boolean,
    private readonly _value?: T,
    private readonly _error?: E,
  ) {}

  public static success<TValue, TError = string>(
    value: TValue,
  ): Result<TValue, TError> {
    return new Result<TValue, TError>(true, value, undefined);
  }

  public static failure<TValue = never, TError = string>(
    error: TError,
  ): Result<TValue, TError> {
    return new Result<TValue, TError>(false, undefined, error);
  }

  public static ok<TValue>(value: TValue): Result<TValue, never> {
    return Result.success(value);
  }

  public static fail<TError>(error: TError): Result<never, TError> {
    return Result.failure(error);
  }

  public isSuccess(): boolean {
    return this._isSuccess;
  }

  public isFailure(): boolean {
    return !this._isSuccess;
  }

  public getValue(): T {
    if (!this._isSuccess) {
      throw new Error('Cannot get the value of a failed Result');
    }
    return this._value as T;
  }

  public getError(): E {
    if (this._isSuccess) {
      throw new Error('Cannot get the error of a successful Result');
    }
    return this._error as E;
  }

  /**
   * Transforms the success value. Mapper exceptions propagate (are not caught).
   */
  public map<U>(fn: (value: T) => U): Result<U, E> {
    if (!this._isSuccess) {
      return Result.failure(this._error as E);
    }
    return Result.success(fn(this._value as T));
  }

  /**
   * Transforms the failure value. Mapper exceptions propagate (are not caught).
   */
  public mapError<F>(fn: (error: E) => F): Result<T, F> {
    if (this._isSuccess) {
      return Result.success(this._value as T);
    }
    return Result.failure(fn(this._error as E));
  }

  /**
   * Chains another Result-producing operation on success.
   * Mapper exceptions propagate (are not caught).
   */
  public flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    if (!this._isSuccess) {
      return Result.failure(this._error as E);
    }
    return fn(this._value as T);
  }

  public getOrElse(fallback: T): T {
    return this._isSuccess ? (this._value as T) : fallback;
  }

  public match<U>(handlers: {
    success: (value: T) => U;
    failure: (error: E) => U;
  }): U {
    return this._isSuccess
      ? handlers.success(this._value as T)
      : handlers.failure(this._error as E);
  }
}
