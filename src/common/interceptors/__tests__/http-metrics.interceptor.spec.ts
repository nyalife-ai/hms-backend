import { ExecutionContext, HttpStatus, HttpException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { HttpMetricsInterceptor } from '../http-metrics.interceptor';
import type { AppLoggerPort } from '../../logging/app-logger.port';
import type { HttpMetricsPort } from '../../metrics/http-metrics.port';

/**
 * Unit Tests for HttpMetricsInterceptor
 *
 * This suite ensures that the interceptor correctly records Prometheus metrics
 * and logs requests, handling both successful responses and errors gracefully.
 */
describe('HttpMetricsInterceptor - Unit Tests', () => {
  let interceptor: HttpMetricsInterceptor;
  let mockMetrics: Partial<HttpMetricsPort>;
  let mockLogger: Partial<AppLoggerPort>;
  let mockExecutionContext: Partial<ExecutionContext>;
  let mockCallHandler: any;
  let mockRequest: any;
  let mockResponse: any;

  /**
   * Setup mock dependencies before each test case.
   */
  beforeEach(() => {
    mockRequest = {
      url: '/api/test',
      route: { path: '/api/test' },
      method: 'GET',
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('Mozilla/5.0'),
      headers: {
        'user-agent': 'Mozilla/5.0',
        'x-request-id': 'test-request-id',
      },
    };

    mockResponse = {
      statusCode: 200,
    };

    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(mockRequest),
        getResponse: jest.fn().mockReturnValue(mockResponse),
      }),
    };

    mockCallHandler = {
      handle: jest.fn().mockReturnValue(of({ success: true })),
    };

    mockMetrics = {
      httpRequestsInFlight: {
        inc: jest.fn(),
        dec: jest.fn(),
      },
      httpRequestsTotal: {
        inc: jest.fn(),
      },
      httpRequestDuration: {
        observe: jest.fn(),
      },
      httpErrorsTotal: {
        inc: jest.fn(),
      },
    };

    mockLogger = {
      logRequest: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    };

    interceptor = new HttpMetricsInterceptor(
      mockMetrics as HttpMetricsPort,
      mockLogger as AppLoggerPort,
    );
  });

  /**
   * Tests for successful request handling.
   */
  describe('intercept() - Successful requests', () => {
    it('should increment in-flight counter on request start', () => {
      interceptor.intercept(
        mockExecutionContext as ExecutionContext,
        mockCallHandler,
      );

      expect(mockMetrics.httpRequestsInFlight.inc).toHaveBeenCalledWith({
        method: 'GET',
      });
    });

    it('should decrement in-flight counter and record metrics on request complete', (done) => {
      const result = interceptor.intercept(
        mockExecutionContext as ExecutionContext,
        mockCallHandler,
      );

      result.subscribe({
        complete: () => {
          expect(mockMetrics.httpRequestsInFlight.dec).toHaveBeenCalledWith({
            method: 'GET',
          });
          expect(mockMetrics.httpRequestsTotal.inc).toHaveBeenCalledWith({
            method: 'GET',
            route: '/api/test',
            status_code: '200',
          });
          expect(mockMetrics.httpRequestDuration.observe).toHaveBeenCalledWith(
            { method: 'GET', route: '/api/test', status_code: '200' },
            expect.any(Number),
          );
          done();
        },
      });
    });

    it('should log successful request with correct context', (done) => {
      const result = interceptor.intercept(
        mockExecutionContext as ExecutionContext,
        mockCallHandler,
      );

      result.subscribe({
        complete: () => {
          expect(mockLogger.logRequest).toHaveBeenCalledWith({
            method: 'GET',
            url: '/api/test',
            statusCode: 200,
            durationMs: expect.any(Number),
            ip: '127.0.0.1',
            userAgent: 'Mozilla/5.0',
            userId: undefined,
            requestId: 'test-request-id',
          });
          done();
        },
      });
    });
  });

  /**
   * Tests for error handling and metric recording during failures.
   */
  describe('intercept() - Error requests', () => {
    it('should handle generic errors, record metrics, and re-throw', (done) => {
      const error = new Error('Test error');
      mockCallHandler.handle.mockReturnValue(throwError(() => error));

      const result = interceptor.intercept(
        mockExecutionContext as ExecutionContext,
        mockCallHandler,
      );

      result.subscribe({
        error: (err) => {
          /**
           * Verify that the error is re-thrown so the Global Exception Filter
           * can still catch it and format the response.
           */
          expect(err).toBe(error);
          expect(mockMetrics.httpRequestsInFlight.dec).toHaveBeenCalledWith({
            method: 'GET',
          });
          expect(mockMetrics.httpErrorsTotal.inc).toHaveBeenCalledWith({
            method: 'GET',
            route: '/api/test',
            status_code: '500',
          });
          expect(mockLogger.error).toHaveBeenCalled();
          done();
        },
      });
    });

    it('should handle HttpException with specific status code', (done) => {
      const error = new HttpException('Bad Request', HttpStatus.BAD_REQUEST);
      mockCallHandler.handle.mockReturnValue(throwError(() => error));

      const result = interceptor.intercept(
        mockExecutionContext as ExecutionContext,
        mockCallHandler,
      );

      result.subscribe({
        error: () => {
          expect(mockMetrics.httpErrorsTotal.inc).toHaveBeenCalledWith({
            method: 'GET',
            route: '/api/test',
            status_code: '400',
          });
          done();
        },
      });
    });
  });

  /**
   * Tests for route normalization to prevent Prometheus cardinality explosion.
   */
  describe('Route normalization', () => {
    it('should normalize numeric IDs in routes', (done) => {
      mockRequest.route = { path: '/api/users/123' };
      mockRequest.url = '/api/users/123';

      const result = interceptor.intercept(
        mockExecutionContext as ExecutionContext,
        mockCallHandler,
      );

      result.subscribe({
        complete: () => {
          expect(mockMetrics.httpRequestsTotal.inc).toHaveBeenCalledWith(
            expect.objectContaining({ route: '/api/users/:id' }),
          );
          done();
        },
      });
    });

    it('should normalize UUIDs in routes', (done) => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      mockRequest.route = { path: `/api/users/uuid/${uuid}` };
      mockRequest.url = `/api/users/uuid/${uuid}`;

      const result = interceptor.intercept(
        mockExecutionContext as ExecutionContext,
        mockCallHandler,
      );

      result.subscribe({
        complete: () => {
          expect(mockMetrics.httpRequestsTotal.inc).toHaveBeenCalledWith(
            expect.objectContaining({ route: '/api/users/uuid/:uuid' }),
          );
          done();
        },
      });
    });

    it('should remove query strings from routes', (done) => {
      mockRequest.route = { path: '/api/test' };
      mockRequest.url = '/api/test?page=1&limit=10';

      const result = interceptor.intercept(
        mockExecutionContext as ExecutionContext,
        mockCallHandler,
      );

      result.subscribe({
        complete: () => {
          expect(mockMetrics.httpRequestsTotal.inc).toHaveBeenCalledWith(
            expect.objectContaining({ route: '/api/test' }),
          );
          done();
        },
      });
    });
  });

  /**
   * Tests for special routing and edge cases.
   */
  describe('Special routes and edge cases', () => {
    it('should skip metrics and logging for /metrics endpoint', () => {
      mockRequest.url = '/metrics';
      mockRequest.route = { path: '/metrics' };

      interceptor.intercept(
        mockExecutionContext as ExecutionContext,
        mockCallHandler,
      );

      expect(mockMetrics.httpRequestsInFlight.inc).not.toHaveBeenCalled();
      expect(mockLogger.logRequest).not.toHaveBeenCalled();
    });

    it('should handle requests with authenticated user', (done) => {
      mockRequest.user = { id: 123, email: 'user@example.com' };

      const result = interceptor.intercept(
        mockExecutionContext as ExecutionContext,
        mockCallHandler,
      );

      result.subscribe({
        complete: () => {
          expect(mockLogger.logRequest).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 123 }),
          );
          done();
        },
      });
    });

    it('should handle requests without x-request-id header', (done) => {
      mockRequest.headers = { 'user-agent': 'Mozilla/5.0' };

      const result = interceptor.intercept(
        mockExecutionContext as ExecutionContext,
        mockCallHandler,
      );

      result.subscribe({
        complete: () => {
          expect(mockLogger.logRequest).toHaveBeenCalledWith(
            expect.objectContaining({ requestId: undefined }),
          );
          done();
        },
      });
    });
  });

  /**
   * Tests for client error status codes (4xx).
   * Uses a loop to keep the test suite DRY and maintainable.
   */
  describe('Client error status codes', () => {
    const clientErrorCodes = [400, 401, 403, 404, 422, 429];

    clientErrorCodes.forEach((code) => {
      it(`should increment error counter for ${code} status`, (done) => {
        mockResponse.statusCode = code;

        const result = interceptor.intercept(
          mockExecutionContext as ExecutionContext,
          mockCallHandler,
        );

        result.subscribe({
          complete: () => {
            expect(mockMetrics.httpErrorsTotal.inc).toHaveBeenCalledWith({
              method: 'GET',
              route: '/api/test',
              status_code: String(code),
            });
            done();
          },
        });
      });
    });
  });
});
