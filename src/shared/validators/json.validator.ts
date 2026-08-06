export interface JsonParseSuccess<T> {
  readonly success: true;
  readonly value: T;
}
export interface JsonParseFailure {
  readonly success: false;
  readonly error: SyntaxError;
}
export type JsonParseResult<T> = JsonParseSuccess<T> | JsonParseFailure;

export const safeJsonParse = <T = unknown>(
  value: string,
): JsonParseResult<T> => {
  try {
    return { success: true, value: JSON.parse(value) as T };
  } catch (error: unknown) {
    return {
      success: false,
      error:
        error instanceof SyntaxError ? error : new SyntaxError('Invalid JSON'),
    };
  }
};
export const isValidJson = (value: unknown): value is string =>
  typeof value === 'string' && safeJsonParse(value).success;
