export const isDefined = <T>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined;
export function assertDefined<T>(
  value: T | null | undefined,
  message = 'Value is required',
): asserts value is T {
  if (!isDefined(value)) throw new TypeError(message);
}
export const ensure = (
  condition: unknown,
  message = 'Invariant failed',
): asserts condition => {
  if (!condition) throw new Error(message);
};
export const assertNever = (
  value: never,
  message = 'Unexpected value',
): never => {
  throw new Error(`${message}: ${String(value)}`);
};
