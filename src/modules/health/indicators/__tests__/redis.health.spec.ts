import { ConfigService } from '@nestjs/config';
import { RedisHealthIndicator } from '../redis.health';

describe('RedisHealthIndicator', () => {
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'redis.host') return 'localhost';
      if (key === 'redis.port') return 6379;
      return undefined;
    }),
  } as unknown as ConfigService;

  it('reports up when injected client pings PONG', async () => {
    const injected = {
      status: 'ready',
      ping: jest.fn().mockResolvedValue('PONG'),
      quit: jest.fn().mockResolvedValue('OK'),
      disconnect: jest.fn(),
    };
    const indicator = new RedisHealthIndicator(config, injected as never);
    const result = await indicator.check();
    expect(result.status).toBe('up');
    expect(injected.ping).toHaveBeenCalled();
    await indicator.onModuleDestroy();
  });

  it('reports down when ping fails', async () => {
    const injected = {
      status: 'ready',
      ping: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      quit: jest.fn().mockResolvedValue('OK'),
      disconnect: jest.fn(),
    };
    const indicator = new RedisHealthIndicator(config, injected as never);
    const result = await indicator.check();
    expect(result.status).toBe('down');
    expect(result.message).toContain('ECONNREFUSED');
  });

  it('reports down on unexpected ping payload', async () => {
    const injected = {
      status: 'ready',
      ping: jest.fn().mockResolvedValue('NOPE'),
      quit: jest.fn().mockResolvedValue('OK'),
      disconnect: jest.fn(),
    };
    const indicator = new RedisHealthIndicator(config, injected as never);
    const result = await indicator.check();
    expect(result.status).toBe('down');
    expect(result.message).toContain('Unexpected Redis ping');
  });
});
