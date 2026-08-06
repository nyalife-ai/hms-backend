export interface SuccessResponse<T> {
  readonly success: true;
  readonly data: T;
  readonly message?: string;
  readonly requestId?: string;
  readonly timestamp: string;
}

export interface ErrorResponse {
  readonly success: false;
  readonly error: Readonly<{
    code: string;
    message: string;
    details?: unknown;
  }>;
  readonly requestId?: string;
  readonly timestamp: string;
}

export type ApiResponseValue<T> = SuccessResponse<T> | ErrorResponse;

export class ApiResponse {
  public static success<T>(
    data: T,
    options: Readonly<{ message?: string; requestId?: string }> = {},
  ): SuccessResponse<T> {
    return {
      success: true,
      data,
      ...options,
      timestamp: new Date().toISOString(),
    };
  }

  public static error(
    options: Readonly<{
      code: string;
      message: string;
      details?: unknown;
      requestId?: string;
    }>,
  ): ErrorResponse {
    const { code, message, details, requestId } = options;
    return {
      success: false,
      error: { code, message, ...(details === undefined ? {} : { details }) },
      ...(requestId === undefined ? {} : { requestId }),
      timestamp: new Date().toISOString(),
    };
  }
}
