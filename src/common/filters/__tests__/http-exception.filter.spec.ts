import { HttpException, HttpStatus } from '@nestjs/common';
import { Response, Request } from 'express';
import { HttpExceptionFilter } from '../http-exception.filter';
import type { AppLoggerPort } from '../../logging/app-logger.port';

/**
 * Unit Tests for HttpExceptionFilter
 *
 * This suite ensures that all HTTP exceptions and unknown errors are
 * correctly caught, logged with the appropriate severity, and returned
 * to the client in a standardized JSON format.
 */
describe('HttpExceptionFilter - Unit Tests', () => {
  let filter: HttpExceptionFilter;
  let mockLogger: Partial<AppLoggerPort>;
  let mockResponse: Partial<Response>;
  let mockRequest: Partial<Request>;
  let mockHost: any;

  /**
   * Setup mock dependencies before each test case.
   */
  beforeEach(() => {
    /**
     * Mock the AppLogger to verify logging calls without writing to actual output.
     */
    mockLogger = {
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn(),
      setContext: jest.fn(),
    };

    /**
     * Mock the Express Response object.
     * headersSent is critical to prevent "Cannot set headers after they are sent" errors.
     */
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      headersSent: false,
    } as any;

    /**
     * Mock the Express Request object.
     * Includes the x-request-id header to match the middleware setup in main.ts.
     */
    mockRequest = {
      url: '/api/test',
      method: 'GET',
      headers: {
        'x-request-id': 'test-request-id-123',
      },
    };

    /**
     * Mock the NestJS ArgumentsHost to return our mocked Request and Response.
     */
    mockHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(mockRequest),
        getResponse: jest.fn().mockReturnValue(mockResponse),
      }),
    };

    filter = new HttpExceptionFilter(mockLogger as AppLoggerPort);
  });

  /**
   * Tests for standard NestJS HttpException handling across various status codes.
   */
  describe('catch() - HttpException handling', () => {
    /**
     * Verifies that a 400 Bad Request is handled, logged as a warning,
     * and returned with the correct status and message.
     */
    it('should handle BadRequestException (400)', () => {
      const exception = new HttpException(
        'Bad Request',
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: 'Bad Request',
          requestId: 'test-request-id-123',
        }),
      );
      expect(mockLogger.warn).toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    /**
     * Verifies that a 401 Unauthorized exception is processed correctly.
     */
    it('should handle UnauthorizedException (401)', () => {
      const exception = new HttpException(
        'Unauthorized',
        HttpStatus.UNAUTHORIZED,
      );

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 401, message: 'Unauthorized' }),
      );
    });

    /**
     * Verifies that a 403 Forbidden exception is processed correctly.
     */
    it('should handle ForbiddenException (403)', () => {
      const exception = new HttpException('Forbidden', HttpStatus.FORBIDDEN);

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 403, message: 'Forbidden' }),
      );
    });

    /**
     * Verifies that a 404 Not Found exception is processed correctly.
     */
    it('should handle NotFoundException (404)', () => {
      const exception = new HttpException('Not Found', HttpStatus.NOT_FOUND);

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404, message: 'Not Found' }),
      );
    });

    /**
     * Verifies that a 500 Internal Server Error is logged as an error
     * rather than a warning, and returned correctly.
     */
    it('should handle InternalServerErrorException (500)', () => {
      const exception = new HttpException(
        'Internal Error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 500, message: 'Internal Error' }),
      );
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    /**
     * Verifies that a 409 Conflict exception is processed correctly.
     */
    it('should handle ConflictException (409)', () => {
      const exception = new HttpException('Conflict', HttpStatus.CONFLICT);

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(409);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 409, message: 'Conflict' }),
      );
    });

    /**
     * Verifies that a 422 Unprocessable Entity exception is processed correctly.
     */
    it('should handle UnprocessableEntityException (422)', () => {
      const exception = new HttpException(
        'Unprocessable Entity',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(422);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 422,
          message: 'Unprocessable Entity',
        }),
      );
    });

    /**
     * Verifies that a 429 Too Many Requests exception is processed correctly.
     */
    it('should handle TooManyRequestsException (429)', () => {
      const exception = new HttpException(
        'Too Many Requests',
        HttpStatus.TOO_MANY_REQUESTS,
      );

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(429);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 429,
          message: 'Too Many Requests',
        }),
      );
    });
  });

  /**
   * Tests for handling unexpected, non-HttpException errors.
   */
  describe('catch() - Non-HttpException errors', () => {
    /**
     * Verifies that standard JavaScript Error objects are caught,
     * defaulted to a 500 status, and logged as errors.
     */
    it('should handle generic Error objects', () => {
      const exception = new Error('Something went wrong');

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          message: 'Something went wrong',
        }),
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });

    /**
     * Verifies that completely unknown objects (not Error, not HttpException)
     * fallback to a generic "Internal server error" message to prevent data leaks.
     */
    it('should handle non-Error objects with a fallback message', () => {
      const exception = { message: 'Unknown error' };

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          message: 'Internal server error',
        }),
      );
    });

    /**
     * Verifies that the stack trace of an Error object is passed to the logger.
     */
    it('should include stack trace for Error objects in logs', () => {
      const exception = new Error('Test error');
      exception.stack = 'Error: Test error\n    at test.js:1:1';

      filter.catch(exception, mockHost);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        'Error: Test error\n    at test.js:1:1',
        expect.any(Object),
      );
    });
  });

  /**
   * Tests for HTTP response safety and structure.
   */
  describe('catch() - Response handling', () => {
    /**
     * Verifies the critical safety check: if headers are already sent,
     * the filter must not attempt to send another response, preventing crashes.
     */
    it('should not send response if headers already sent', () => {
      (mockResponse as any).headersSent = true;
      const exception = new HttpException('Test', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockHost);

      expect(mockResponse.status).not.toHaveBeenCalled();
      expect(mockResponse.json).not.toHaveBeenCalled();
    });

    /**
     * Verifies that the response includes an ISO formatted timestamp.
     */
    it('should include timestamp in response', () => {
      const exception = new HttpException('Test', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockHost);

      const response = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(response.timestamp).toBeDefined();
      expect(new Date(response.timestamp).toISOString()).toBe(
        response.timestamp,
      );
    });

    /**
     * Verifies that the response includes the exact path that caused the error.
     */
    it('should include path in response', () => {
      const exception = new HttpException('Test', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockHost);

      const response = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(response.path).toBe('/api/test');
    });

    /**
     * Verifies that the response includes the request ID for client-side debugging.
     */
    it('should include requestId in the JSON response', () => {
      const exception = new HttpException('Test', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockHost);

      const response = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(response.requestId).toBe('test-request-id-123');
    });
  });

  /**
   * Tests for observability and structured logging behavior.
   */
  describe('Logging behavior', () => {
    /**
     * Verifies that 4xx client errors are logged as warnings,
     * keeping error monitoring tools clean from expected user mistakes.
     */
    it('should log client errors (4xx) as warnings', () => {
      const exception = new HttpException(
        'Bad Request',
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(exception, mockHost);

      expect(mockLogger.warn).toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    /**
     * Verifies that 5xx server errors are logged as errors.
     */
    it('should log server errors (5xx) as errors', () => {
      const exception = new HttpException(
        'Internal Error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );

      filter.catch(exception, mockHost);

      expect(mockLogger.error).toHaveBeenCalled();
    });

    /**
     * Verifies that the structured log data includes the HTTP method and route.
     */
    it('should include request method and route in log data', () => {
      const exception = new HttpException('Test', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockHost);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'GET',
          route: '/api/test',
        }),
      );
    });

    /**
     * Verifies that the structured log data includes the request ID for tracing.
     */
    it('should include request ID in log data', () => {
      const exception = new HttpException('Test', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockHost);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          requestId: 'test-request-id-123',
        }),
      );
    });
  });

  /**
   * Tests for complex HttpException payloads (e.g., validation errors).
   */
  describe('HttpException with object response', () => {
    /**
     * Verifies that when an HttpException contains a custom object payload,
     * the filter correctly extracts and returns the 'message' property.
     */
    it('should extract message from object response', () => {
      const exception = new HttpException(
        { message: 'Custom message', code: 'CUSTOM_ERROR' },
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(exception, mockHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Custom message',
        }),
      );
    });

    /**
     * Verifies that validation arrays (common in class-validator) are
     * correctly passed through to the client.
     */
    it('should handle nested message array from validation errors', () => {
      const exception = new HttpException(
        {
          message: ['Field is required', 'Field must be a string'],
          code: 'VALIDATION_ERROR',
        },
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(exception, mockHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: ['Field is required', 'Field must be a string'],
        }),
      );
    });
  });
});
