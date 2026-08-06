import { BaseCommand, createCommandId } from '../command';
import type { CommandHandler } from '../command-handler';
import type { CommandBus } from '../command-bus';
import { BaseQuery, createQueryId } from '../query';
import type { QueryHandler } from '../query-handler';
import type { QueryBus } from '../query-bus';
import type { EventBus } from '../event-bus';

class CreateResourceCommand extends BaseCommand {
  public readonly commandName = 'resource.create';

  public constructor(
    public readonly name: string,
    props: ConstructorParameters<typeof BaseCommand>[0] = {},
  ) {
    super(props);
  }
}

class GetResourceQuery extends BaseQuery {
  public readonly queryName = 'resource.get';

  public constructor(
    public readonly resourceId: string,
    props: ConstructorParameters<typeof BaseQuery>[0] = {},
  ) {
    super(props);
  }
}

class CreateResourceHandler implements CommandHandler<
  CreateResourceCommand,
  { id: string }
> {
  public readonly commandType = 'resource.create';

  public async execute(
    command: CreateResourceCommand,
  ): Promise<{ id: string }> {
    return { id: `id-for-${command.name}` };
  }
}

class GetResourceHandler implements QueryHandler<
  GetResourceQuery,
  { id: string; name: string } | null
> {
  public readonly queryType = 'resource.get';

  public async execute(
    query: GetResourceQuery,
  ): Promise<{ id: string; name: string } | null> {
    if (query.resourceId === 'missing') {
      return null;
    }
    return { id: query.resourceId, name: 'demo' };
  }
}

class InMemoryCommandBus implements CommandBus {
  public constructor(
    private readonly handlers: Map<
      string,
      CommandHandler<BaseCommand, unknown>
    >,
  ) {}

  public async execute<TResult = void>(command: BaseCommand): Promise<TResult> {
    const handler = this.handlers.get(command.commandName);
    if (!handler) {
      throw new Error(`No handler for ${command.commandName}`);
    }
    return handler.execute(command) as Promise<TResult>;
  }
}

class InMemoryQueryBus implements QueryBus {
  public constructor(
    private readonly handlers: Map<string, QueryHandler<BaseQuery, unknown>>,
  ) {}

  public async execute<TResult>(query: BaseQuery): Promise<TResult> {
    const handler = this.handlers.get(query.queryName);
    if (!handler) {
      throw new Error(`No handler for ${query.queryName}`);
    }
    return handler.execute(query) as Promise<TResult>;
  }
}

class InMemoryEventBus implements EventBus {
  public readonly published: unknown[] = [];

  public async publish(event: unknown): Promise<void> {
    this.published.push(event);
  }

  public async publishAll(events: ReadonlyArray<unknown>): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }
}

describe('CQRS identifiers', () => {
  it('creates unique command ids', () => {
    expect(createCommandId()).not.toBe(createCommandId());
  });

  it('creates unique query ids', () => {
    expect(createQueryId()).not.toBe(createQueryId());
  });
});

describe('BaseCommand / BaseQuery defaults', () => {
  it('uses constructor defaults when props are omitted', () => {
    class BareCommand extends BaseCommand {
      public readonly commandName = 'bare.command';
      public constructor() {
        super();
      }
    }

    class BareQuery extends BaseQuery {
      public readonly queryName = 'bare.query';
      public constructor() {
        super();
      }
    }

    const command = new BareCommand();
    const query = new BareQuery();
    expect(command.commandId.length).toBeGreaterThan(0);
    expect(query.queryId.length).toBeGreaterThan(0);
  });
});

describe('BaseCommand / BaseQuery', () => {
  it('assigns defaults for id and timestamp', () => {
    const command = new CreateResourceCommand('alpha');
    expect(command.commandId.length).toBeGreaterThan(0);
    expect(command.occurredAt).toBeInstanceOf(Date);
    expect(command.commandName).toBe('resource.create');
  });

  it('accepts explicit command props', () => {
    const at = new Date('2026-01-01T00:00:00.000Z');
    const metadata = { source: 'test' as const };
    const command = new CreateResourceCommand('alpha', {
      commandId: 'cmd-1',
      occurredAt: at,
      correlationId: 'corr-1',
      causationId: 'cause-1',
      metadata,
    });
    expect(command.commandId).toBe('cmd-1');
    expect(command.occurredAt.getTime()).toBe(
      new Date('2026-01-01T00:00:00.000Z').getTime(),
    );
    expect(command.correlationId).toBe('corr-1');
    expect(command.causationId).toBe('cause-1');
    expect(command.metadata).toEqual({ source: 'test' });
    at.setUTCFullYear(1999);
    (metadata as { source: string }).source = 'mutated';
    expect(command.occurredAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(command.metadata).toEqual({ source: 'test' });
    expect(Object.isFrozen(command.metadata)).toBe(true);
  });

  it('assigns query defaults and explicit props', () => {
    const at = new Date('2026-02-01T00:00:00.000Z');
    const query = new GetResourceQuery('r1', {
      queryId: 'qry-1',
      occurredAt: at,
      correlationId: 'corr-2',
      metadata: { page: 1 },
    });
    expect(query.queryId).toBe('qry-1');
    expect(query.occurredAt.getTime()).toBe(at.getTime());
    expect(query.correlationId).toBe('corr-2');
    expect(query.metadata).toEqual({ page: 1 });
    expect(query.queryName).toBe('resource.get');
    expect(Object.isFrozen(query.metadata)).toBe(true);
    at.setUTCFullYear(1999);
    expect(query.occurredAt.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });
});

describe('CommandHandler / QueryHandler', () => {
  it('executes a typed command handler', async () => {
    const handler = new CreateResourceHandler();
    const result = await handler.execute(new CreateResourceCommand('widget'));
    expect(result).toEqual({ id: 'id-for-widget' });
    expect(handler.commandType).toBe('resource.create');
  });

  it('executes a typed query handler', async () => {
    const handler = new GetResourceHandler();
    await expect(handler.execute(new GetResourceQuery('r1'))).resolves.toEqual({
      id: 'r1',
      name: 'demo',
    });
    await expect(
      handler.execute(new GetResourceQuery('missing')),
    ).resolves.toBeNull();
  });
});

describe('Bus contracts', () => {
  it('dispatches commands through CommandBus', async () => {
    const bus = new InMemoryCommandBus(
      new Map([['resource.create', new CreateResourceHandler()]]),
    );
    const result = await bus.execute<{ id: string }>(
      new CreateResourceCommand('device'),
    );
    expect(result.id).toBe('id-for-device');
  });

  it('throws when command handler is missing', async () => {
    const bus = new InMemoryCommandBus(new Map());
    await expect(bus.execute(new CreateResourceCommand('x'))).rejects.toThrow(
      'No handler for resource.create',
    );
  });

  it('dispatches queries through QueryBus', async () => {
    const bus = new InMemoryQueryBus(
      new Map([['resource.get', new GetResourceHandler()]]),
    );
    const result = await bus.execute<{ id: string; name: string } | null>(
      new GetResourceQuery('abc'),
    );
    expect(result?.id).toBe('abc');
  });

  it('throws when query handler is missing', async () => {
    const bus = new InMemoryQueryBus(new Map());
    await expect(bus.execute(new GetResourceQuery('abc'))).rejects.toThrow(
      'No handler for resource.get',
    );
  });

  it('publishes events through EventBus', async () => {
    const bus = new InMemoryEventBus();
    await bus.publish({ type: 'one' });
    await bus.publishAll([{ type: 'two' }, { type: 'three' }]);
    expect(bus.published).toEqual([
      { type: 'one' },
      { type: 'two' },
      { type: 'three' },
    ]);
  });
});
