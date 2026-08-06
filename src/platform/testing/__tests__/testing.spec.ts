import * as testing from '../index';
import { ContainerManager } from '../container-manager';
import {
  PostgresContainerDriver,
  RedisContainerDriver,
  TestContainer,
} from '../container.types';
import { define } from '../fixtures';
import {
  createMock,
  FakeClock,
  FixedIdGenerator,
  mockFn,
  mockReturnValue,
} from '../mock-factory';
import { PostgresTestHelper } from '../postgres-test.helper';
import { RedisTestHelper } from '../redis-test.helper';
import { TestModuleBuilder } from '../test-module.builder';

interface ExamplePort {
  readonly label: string;
  execute(value: number): number;
}

function container(
  uri: string,
  start: () => Promise<void> = async (): Promise<void> => undefined,
  stop: () => Promise<void> = async (): Promise<void> => undefined,
): TestContainer {
  return { start, stop, getConnectionUri: (): string => uri };
}

describe('testing platform', () => {
  it('creates typed mocks and records mock function calls', () => {
    const execute = mockFn((value: number): number => value * 2);
    const port = createMock<ExamplePort>({ label: 'mock', execute });
    expect(port.execute(3)).toBe(6);
    expect(execute.calls).toEqual([[3]]);
    expect(mockReturnValue('fixed')()).toBe('fixed');
    expect(createMock<ExamplePort>()).toEqual({});
  });

  it('provides deterministic clock and identifier mocks', () => {
    const epoch = new FakeClock();
    expect(epoch.timestamp()).toBe(0);
    const clock = new FakeClock(new Date('2026-01-01T00:00:00Z'));
    const snapshot = clock.now();
    snapshot.setUTCFullYear(2030);
    expect(clock.now()).toEqual(new Date('2026-01-01T00:00:00Z'));
    clock.advance(1_000);
    expect(clock.timestamp()).toBe(Date.parse('2026-01-01T00:00:01Z'));
    clock.set(new Date('2027-01-01T00:00:00Z'));
    expect(clock.now()).toEqual(new Date('2027-01-01T00:00:00Z'));
    expect(new FixedIdGenerator(42).next()).toBe(42);
  });

  it('builds provider override maps without NestJS', () => {
    const token = Symbol('token');
    class Service {}
    const builder = new TestModuleBuilder()
      .override(token, 'value')
      .overrideMany([{ token: Service, value: new Service() }]);
    expect(builder.get<string>(token)).toBe('value');
    expect(builder.get(Symbol('missing'))).toBeUndefined();
    const built = builder.build();
    builder.override(token, 'changed');
    expect(built.get(token)).toBe('value');
  });

  it('builds fixtures and validates collection sizes', () => {
    let sequence = 0;
    const fixture = define((): { id: number; name: string } => ({
      id: ++sequence,
      name: 'default',
    }));
    expect(fixture.build()).toEqual({ id: 1, name: 'default' });
    expect(fixture.build({ name: 'custom' })).toEqual({
      id: 2,
      name: 'custom',
    });
    expect(fixture.buildMany(2, { name: 'many' })).toEqual([
      { id: 3, name: 'many' },
      { id: 4, name: 'many' },
    ]);
    expect(() => fixture.buildMany(-1)).toThrow(RangeError);
    expect(() => fixture.buildMany(1.5)).toThrow(RangeError);
  });

  it('starts, stops, and cleans up managed containers', async () => {
    const events: string[] = [];
    const first = container(
      'first',
      async (): Promise<void> => {
        events.push('start-first');
      },
      async (): Promise<void> => {
        events.push('stop-first');
      },
    );
    const second = container(
      'second',
      async (): Promise<void> => undefined,
      async (): Promise<void> => {
        events.push('stop-second');
      },
    );
    const manager = new ContainerManager();
    expect(await manager.start(first)).toBe('first');
    expect(await manager.start(second)).toBe('second');
    expect(manager.size).toBe(2);
    await manager.stop(first);
    await manager.stop(container('untracked'));
    expect(manager.size).toBe(1);
    await manager.stopAll();
    expect(events).toEqual(['start-first', 'stop-first', 'stop-second']);
    expect(manager.size).toBe(0);
  });

  it('cleans failed starts and reports stop-all failures', async () => {
    let cleanup = 0;
    const failed = container(
      'failed',
      async (): Promise<void> => {
        throw new Error('start failed');
      },
      async (): Promise<void> => {
        cleanup += 1;
        throw new Error('cleanup failed');
      },
    );
    const manager = new ContainerManager();
    await expect(manager.start(failed)).rejects.toThrow('start failed');
    expect(cleanup).toBe(1);

    await manager.start(
      container('bad-stop', undefined, async (): Promise<void> => {
        throw new Error('stop failed');
      }),
    );
    await manager.start(container('good-stop'));
    await expect(manager.stopAll()).rejects.toThrow('stop failed');
  });

  it('uses injected postgres and redis drivers', async () => {
    const postgresContainer = container('postgres://local');
    const redisContainer = container('redis://local');
    const postgresDriver: PostgresContainerDriver = {
      createPostgresContainer: (): TestContainer => postgresContainer,
    };
    const redisDriver: RedisContainerDriver = {
      createRedisContainer: (): TestContainer => redisContainer,
    };
    const postgres = new PostgresTestHelper(postgresDriver);
    const redis = new RedisTestHelper(redisDriver);
    expect((await postgres.start()).connectionUri).toBe('postgres://local');
    expect((await redis.start()).connectionUri).toBe('redis://local');
    await postgres.stop();
    await redis.stop();
    await postgres.stop();
    await redis.stop();
  });

  it('exports the public testing surface', () => {
    expect(testing.ContainerManager).toBe(ContainerManager);
    expect(testing.define).toBe(define);
  });
});
