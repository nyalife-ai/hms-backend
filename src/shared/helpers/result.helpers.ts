import { Result } from '../../core/contracts/result';

export const ok = <T>(value: T): Result<T, never> => Result.ok(value);
export const err = <E>(error: E): Result<never, E> => Result.fail(error);
export const fromThrowable = <T, E>(
  operation: () => T,
  mapError: (error: unknown) => E,
): Result<T, E> => {
  try {
    return Result.success(operation());
  } catch (error: unknown) {
    return Result.failure(mapError(error));
  }
};
export const unwrapOr = <T, E>(result: Result<T, E>, fallback: T): T =>
  result.getOrElse(fallback);
export const combineResults = <T, E>(
  results: readonly Result<T, E>[],
): Result<T[], E> => {
  const values: T[] = [];
  for (const result of results) {
    if (result.isFailure()) return Result.failure(result.getError());
    values.push(result.getValue());
  }
  return Result.success(values);
};
