import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HealthService } from '../health.service';
import { DatabaseHealthIndicator } from '../indicators/database.health';
import { RedisHealthIndicator } from '../indicators/redis.health';
import { SystemHealthIndicator } from '../indicators/system.health';

const upResult = { status: 'up' as const };
const downResult = { status: 'down' as const, message: 'Connection refused' };

const mockDbHealth = { name: 'database', check: jest.fn() };
const mockRedisHealth = { name: 'redis', check: jest.fn() };
const mockSystemHealth = { name: 'system', check: jest.fn() };
const mockConfigService = { get: jest.fn().mockReturnValue('1.0.0') };

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: DatabaseHealthIndicator, useValue: mockDbHealth },
        { provide: RedisHealthIndicator, useValue: mockRedisHealth },
        { provide: SystemHealthIndicator, useValue: mockSystemHealth },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();
    service = module.get<HealthService>(HealthService);
  });

  it('should be defined', () => expect(service).toBeDefined());

  describe('checkAll()', () => {
    it('returns all indicators as up when everything is healthy', async () => {
      mockDbHealth.check.mockResolvedValue(upResult);
      mockRedisHealth.check.mockResolvedValue(upResult);
      mockSystemHealth.check.mockResolvedValue(upResult);

      const result = await service.checkAll();
      expect(result.database.status).toBe('up');
      expect(result.redis.status).toBe('up');
      expect(result.system.status).toBe('up');
    });

    it('includes down indicator when DB is unreachable', async () => {
      mockDbHealth.check.mockResolvedValue(downResult);
      mockRedisHealth.check.mockResolvedValue(upResult);
      mockSystemHealth.check.mockResolvedValue(upResult);

      const result = await service.checkAll();
      expect(result.database.status).toBe('down');
    });

    it('runs all checks in parallel', async () => {
      const calls: string[] = [];
      mockDbHealth.check.mockImplementation(async () => {
        calls.push('db');
        return upResult;
      });
      mockRedisHealth.check.mockImplementation(async () => {
        calls.push('redis');
        return upResult;
      });
      mockSystemHealth.check.mockImplementation(async () => {
        calls.push('system');
        return upResult;
      });

      await service.checkAll();
      // All three should have been called regardless of order
      expect(calls).toHaveLength(3);
    });
  });

  describe('checkReady()', () => {
    it('returns true when DB is up and Redis is optional', async () => {
      mockDbHealth.check.mockResolvedValue(upResult);
      mockRedisHealth.check.mockResolvedValue(upResult);

      expect(await service.checkReady()).toBe(true);
    });

    it('returns false when DB is down', async () => {
      mockDbHealth.check.mockResolvedValue(downResult);
      mockRedisHealth.check.mockResolvedValue(upResult);

      expect(await service.checkReady()).toBe(false);
    });

    it('ignores Redis down when Redis is optional', async () => {
      const prev = process.env.REDIS_OPTIONAL;
      delete process.env.REDIS_OPTIONAL;
      mockDbHealth.check.mockResolvedValue(upResult);
      mockRedisHealth.check.mockResolvedValue(downResult);

      expect(await service.checkReady()).toBe(true);
      if (prev === undefined) delete process.env.REDIS_OPTIONAL;
      else process.env.REDIS_OPTIONAL = prev;
    });

    it('returns false when Redis is required and down', async () => {
      const prev = process.env.REDIS_OPTIONAL;
      process.env.REDIS_OPTIONAL = 'false';
      mockDbHealth.check.mockResolvedValue(upResult);
      mockRedisHealth.check.mockResolvedValue(downResult);

      expect(await service.checkReady()).toBe(false);
      if (prev === undefined) delete process.env.REDIS_OPTIONAL;
      else process.env.REDIS_OPTIONAL = prev;
    });
  });

  describe('getMetrics()', () => {
    it('returns memory and uptime metrics', () => {
      const metrics = service.getMetrics();
      expect(metrics.uptime).toBeGreaterThanOrEqual(0);
      expect(metrics.memory_usage).toHaveProperty('heapUsed');
      expect(metrics.memory_usage).toHaveProperty('rss');
    });

    it('includes version string', () => {
      const metrics = service.getMetrics();
      expect(typeof metrics.version).toBe('string');
    });
  });
});
