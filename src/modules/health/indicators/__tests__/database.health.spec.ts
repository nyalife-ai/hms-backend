import { ConfigService } from '@nestjs/config';
import {
  DATABASE_PING_CLIENT,
  DatabaseHealthIndicator,
  type DatabasePingClient,
} from '../database.health';

describe('DatabaseHealthIndicator', () => {
  const config = {
    get: jest.fn().mockReturnValue('prisma'),
  } as unknown as ConfigService;

  const create = (client?: DatabasePingClient): DatabaseHealthIndicator =>
    new DatabaseHealthIndicator(config, client);

  it('reports down when no ping client is registered', async () => {
    const result = await create().check();
    expect(result.status).toBe('down');
    expect(result.message).toContain('not registered');
  });

  it('reports up when SELECT 1 succeeds', async () => {
    const client: DatabasePingClient = {
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    const result = await create(client).check();
    expect(result.status).toBe('up');
    expect(result.latency).toBeGreaterThanOrEqual(0);
    expect(client.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('reports down when the query fails', async () => {
    const client: DatabasePingClient = {
      query: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    };
    const result = await create(client).check();
    expect(result.status).toBe('down');
    expect(result.message).toContain('ECONNREFUSED');
  });

  it('stringifies non-Error failures', async () => {
    const client: DatabasePingClient = {
      query: jest.fn().mockRejectedValue('boom'),
    };
    const result = await create(client).check();
    expect(result.status).toBe('down');
    expect(result.message).toBe('boom');
  });

  it('exposes DATABASE_PING_CLIENT token', () => {
    expect(DATABASE_PING_CLIENT).toBeDefined();
  });
});
