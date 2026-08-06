import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../logger.service';

/**
 * Unit Tests for AppLogger
 */
describe('AppLogger - Unit Tests', () => {
  let logger: AppLogger;
  let mockConfigService: Partial<ConfigService>;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'test';
        if (key === 'APP_NAME') return 'api-test';
        if (key === 'ELASTICSEARCH_URL') return undefined;
        return undefined;
      }),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  describe('Construction', () => {
    it('should create logger with default config', () => {
      logger = new AppLogger(mockConfigService as ConfigService);
      expect(logger).toBeDefined();
    });

    it('should create logger with development config', () => {
      mockConfigService.get = jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'development';
        if (key === 'APP_NAME') return 'api-dev';
        return undefined;
      });

      logger = new AppLogger(mockConfigService as ConfigService);
      expect(logger).toBeDefined();
    });

    it('should create logger with production config', () => {
      mockConfigService.get = jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'APP_NAME') return 'api-prod';
        return undefined;
      });

      logger = new AppLogger(mockConfigService as ConfigService);
      expect(logger).toBeDefined();
    });

    it('should create logger with Elasticsearch URL', () => {
      mockConfigService.get = jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'APP_NAME') return 'api';
        if (key === 'ELASTICSEARCH_URL') return 'http://localhost:9200';
        return undefined;
      });

      logger = new AppLogger(mockConfigService as ConfigService);
      expect(logger).toBeDefined();
    });
  });

  describe('setContext()', () => {
    beforeEach(() => {
      logger = new AppLogger(mockConfigService as ConfigService);
    });

    it('should set context successfully', () => {
      logger.setContext('TestContext');
      // Context is set internally, verify no errors
      expect(() => logger.setContext('TestContext')).not.toThrow();
    });

    it('should accept different context values', () => {
      expect(() => logger.setContext('AuthService')).not.toThrow();
      expect(() => logger.setContext('PaymentController')).not.toThrow();
      expect(() => logger.setContext('')).not.toThrow();
    });
  });

  describe('log()', () => {
    beforeEach(() => {
      logger = new AppLogger(mockConfigService as ConfigService);
    });

    it('should log message without context', () => {
      expect(() => logger.log('Test message')).not.toThrow();
    });

    it('should log message with context', () => {
      expect(() => logger.log('Test message', 'TestContext')).not.toThrow();
    });

    it('should log message with metadata object', () => {
      expect(() => logger.log('Test message', { userId: 123 })).not.toThrow();
    });

    it('should log message with context and metadata', () => {
      expect(() => {
        logger.setContext('TestContext');
        logger.log('Test message', { userId: 123 });
      }).not.toThrow();
    });

    it('should log empty message', () => {
      expect(() => logger.log('')).not.toThrow();
    });

    it('should log special characters', () => {
      expect(() => logger.log('Test: @#$%^&*()')).not.toThrow();
    });

    it('should log unicode characters', () => {
      expect(() => logger.log('Test: 你好 🎉')).not.toThrow();
    });
  });

  describe('error()', () => {
    beforeEach(() => {
      logger = new AppLogger(mockConfigService as ConfigService);
    });

    it('should log error message', () => {
      expect(() => logger.error('Error occurred')).not.toThrow();
    });

    it('should log error with stack trace', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:1:1';
      expect(() => logger.error('Error occurred', error.stack)).not.toThrow();
    });

    it('should log error with context', () => {
      expect(() => logger.error('Error occurred', 'TestContext')).not.toThrow();
    });

    it('should log error with metadata', () => {
      expect(() =>
        logger.error('Error occurred', undefined, { userId: 123 }),
      ).not.toThrow();
    });

    it('should log error with context and metadata', () => {
      expect(() =>
        logger.error('Error occurred', 'stack', { userId: 123 }),
      ).not.toThrow();
    });

    it('should log error without stack trace', () => {
      expect(() => logger.error('Error occurred', undefined)).not.toThrow();
    });
  });

  describe('warn()', () => {
    beforeEach(() => {
      logger = new AppLogger(mockConfigService as ConfigService);
    });

    it('should log warning message', () => {
      expect(() => logger.warn('Warning message')).not.toThrow();
    });

    it('should log warning with context', () => {
      expect(() => logger.warn('Warning message', 'TestContext')).not.toThrow();
    });

    it('should log warning with metadata', () => {
      expect(() =>
        logger.warn('Warning message', { userId: 123 }),
      ).not.toThrow();
    });
  });

  describe('debug()', () => {
    beforeEach(() => {
      logger = new AppLogger(mockConfigService as ConfigService);
    });

    it('should log debug message', () => {
      expect(() => logger.debug('Debug message')).not.toThrow();
    });

    it('should log debug with context', () => {
      expect(() => logger.debug('Debug message', 'TestContext')).not.toThrow();
    });
  });

  describe('verbose()', () => {
    beforeEach(() => {
      logger = new AppLogger(mockConfigService as ConfigService);
    });

    it('should log verbose message', () => {
      expect(() => logger.verbose('Verbose message')).not.toThrow();
    });

    it('should log verbose with context', () => {
      expect(() =>
        logger.verbose('Verbose message', 'TestContext'),
      ).not.toThrow();
    });
  });

  describe('logRequest()', () => {
    beforeEach(() => {
      logger = new AppLogger(mockConfigService as ConfigService);
    });

    it('should log HTTP request', () => {
      expect(() =>
        logger.logRequest({
          method: 'GET',
          url: '/api/test',
          statusCode: 200,
          durationMs: 100,
          ip: '127.0.0.1',
          userAgent: 'Mozilla/5.0',
        }),
      ).not.toThrow();
    });

    it('should log HTTP request with userId', () => {
      expect(() =>
        logger.logRequest({
          method: 'POST',
          url: '/api/payments',
          statusCode: 201,
          durationMs: 250,
          ip: '127.0.0.1',
          userAgent: 'Mozilla/5.0',
          userId: 123,
        }),
      ).not.toThrow();
    });

    it('should log HTTP request with requestId', () => {
      expect(() =>
        logger.logRequest({
          method: 'GET',
          url: '/api/users',
          statusCode: 200,
          durationMs: 50,
          ip: '127.0.0.1',
          userAgent: 'Mozilla/5.0',
          requestId: 'req-123',
        }),
      ).not.toThrow();
    });

    it('should log HTTP request with all metadata', () => {
      expect(() =>
        logger.logRequest({
          method: 'PUT',
          url: '/api/users/123',
          statusCode: 200,
          durationMs: 150,
          ip: '192.168.1.1',
          userAgent: 'PostmanRuntime/7.28.0',
          userId: 456,
          requestId: 'req-456',
        }),
      ).not.toThrow();
    });
  });

  describe('Error handling', () => {
    beforeEach(() => {
      logger = new AppLogger(mockConfigService as ConfigService);
    });

    it('should handle null message gracefully', () => {
      expect(() => (logger as any).log(null)).not.toThrow();
    });

    it('should handle undefined message gracefully', () => {
      expect(() => (logger as any).log(undefined)).not.toThrow();
    });

    it('should handle number message gracefully', () => {
      expect(() => (logger as any).log(123)).not.toThrow();
    });

    it('should handle object message gracefully', () => {
      expect(() => (logger as any).log({ message: 'test' })).not.toThrow();
    });
  });

  describe('Multiple contexts', () => {
    beforeEach(() => {
      logger = new AppLogger(mockConfigService as ConfigService);
    });

    it('should handle multiple context changes', () => {
      expect(() => {
        logger.setContext('Context1');
        logger.log('Message 1');
        logger.setContext('Context2');
        logger.log('Message 2');
        logger.setContext('Context3');
        logger.error('Error 3');
      }).not.toThrow();
    });
  });

  describe('Concurrent logging', () => {
    beforeEach(() => {
      logger = new AppLogger(mockConfigService as ConfigService);
    });

    it('should handle multiple concurrent log calls', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        Promise.resolve().then(() => logger.log(`Message ${i}`)),
      );

      await expect(Promise.all(promises)).resolves.not.toThrow();
    });
  });
});
