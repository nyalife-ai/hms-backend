import {
  DomainEvent,
  createDomainEventId,
  type DomainEventProps,
} from '../domain-event';
import { Entity } from '../entity';
import { AggregateRoot } from '../aggregate-root';
import { ValueObject } from '../value-object';

class TestDomainEvent extends DomainEvent {
  public constructor(
    aggregateId: string,
    overrides: Partial<DomainEventProps> = {},
  ) {
    super({
      eventId: overrides.eventId ?? createDomainEventId(),
      aggregateId,
      occurredAt: overrides.occurredAt ?? new Date('2026-01-01T00:00:00.000Z'),
      eventVersion: overrides.eventVersion ?? 1,
      eventName: overrides.eventName ?? 'test.event',
      metadata: overrides.metadata,
    });
  }
}

class BrandedId {
  public constructor(public readonly value: string) {}
  public equals(other: BrandedId): boolean {
    return this.value === other.value;
  }
}

class TestEntity extends Entity<string> {
  public constructor(
    id: string,
    createdAt = new Date(),
    updatedAt = new Date(),
  ) {
    super(id, createdAt, updatedAt);
  }

  public recordEvent(event: DomainEvent): void {
    this.addDomainEvent(event);
  }

  public bump(at?: Date): void {
    this.touch(at);
  }
}

class OtherEntity extends Entity<string> {
  public constructor(id: string) {
    super(id, new Date(), new Date());
  }
}

class BrandedEntity extends Entity<BrandedId> {
  public constructor(id: BrandedId) {
    super(id, new Date(), new Date());
  }
}

class NumericEntity extends Entity<number> {
  public constructor(id: number) {
    super(id, new Date(), new Date());
  }
}

class TestAggregate extends AggregateRoot<string> {
  private name: string;

  private constructor(
    id: string,
    name: string,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this.name = name;
  }

  public static create(id: string, name: string): TestAggregate {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const aggregate = new TestAggregate(id, name, now, now);
    aggregate.record(new TestDomainEvent(id, { eventName: 'test.created' }));
    return aggregate;
  }

  public rename(name: string): void {
    this.name = name;
    this.touch(new Date('2026-01-02T00:00:00.000Z'));
    this.addEvent(
      new TestDomainEvent(this.getId(), { eventName: 'test.renamed' }),
    );
  }

  public getName(): string {
    return this.name;
  }
}

class MoneyProps {
  public constructor(
    public readonly amount: number,
    public readonly currency: string,
  ) {}
}

class Money extends ValueObject<MoneyProps> {
  private constructor(props: MoneyProps) {
    super(props);
  }

  public static create(amount: number, currency: string): Money {
    return new Money(new MoneyProps(amount, currency));
  }

  protected validate(props: Readonly<MoneyProps>): void {
    if (!Number.isFinite(props.amount)) {
      throw new Error('Amount must be finite');
    }
    if (!props.currency || props.currency.length !== 3) {
      throw new Error('Currency must be a 3-letter code');
    }
  }
}

class ScalarVO extends ValueObject<string> {
  private constructor(value: string) {
    super(value);
  }

  public static of(value: string): ScalarVO {
    return new ScalarVO(value);
  }
}

class OtherMoney extends ValueObject<MoneyProps> {
  private constructor(props: MoneyProps) {
    super(props);
  }

  public static create(amount: number, currency: string): OtherMoney {
    return new OtherMoney(new MoneyProps(amount, currency));
  }
}

describe('createDomainEventId', () => {
  it('returns a non-empty string', () => {
    expect(createDomainEventId().length).toBeGreaterThan(8);
  });

  it('returns unique values across calls', () => {
    const a = createDomainEventId();
    const b = createDomainEventId();
    expect(a).not.toBe(b);
  });
});

describe('DomainEvent', () => {
  it('stores identity and metadata', () => {
    const event = new TestDomainEvent('agg-1', {
      eventId: 'evt-1',
      metadata: { key: 'value' },
    });
    expect(event.eventId).toBe('evt-1');
    expect(event.aggregateId).toBe('agg-1');
    expect(event.eventVersion).toBe(1);
    expect(event.eventName).toBe('test.event');
    expect(event.metadata).toEqual({ key: 'value' });
    expect(event.occurredAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('clones occurredAt and freezes metadata copies', () => {
    const at = new Date('2026-01-01T00:00:00.000Z');
    const metadata = { key: 'value' as const };
    const event = new TestDomainEvent('agg-1', {
      eventId: 'evt-1',
      occurredAt: at,
      metadata,
    });
    at.setUTCFullYear(1999);
    metadata.key = 'mutated' as 'value';
    expect(event.occurredAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(event.metadata).toEqual({ key: 'value' });
    expect(Object.isFrozen(event.metadata)).toBe(true);
    const read = event.occurredAt;
    read.setUTCFullYear(1999);
    expect(event.occurredAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('Entity', () => {
  it('rejects null identity', () => {
    expect(() => new TestEntity(null as unknown as string)).toThrow(
      'Entity identity is required',
    );
  });

  it('rejects undefined identity', () => {
    expect(() => new TestEntity(undefined as unknown as string)).toThrow(
      'Entity identity is required',
    );
  });

  it('exposes id and timestamps', () => {
    const created = new Date('2026-01-01T00:00:00.000Z');
    const updated = new Date('2026-01-02T00:00:00.000Z');
    const entity = new TestEntity('id-1', created, updated);
    expect(entity.getId()).toBe('id-1');
    expect(entity.getCreatedAt().getTime()).toBe(created.getTime());
    expect(entity.getUpdatedAt().getTime()).toBe(updated.getTime());
    created.setUTCFullYear(1999);
    updated.setUTCFullYear(1999);
    expect(entity.getCreatedAt().toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    );
    expect(entity.getUpdatedAt().toISOString()).toBe(
      '2026-01-02T00:00:00.000Z',
    );
    const readCreated = entity.getCreatedAt();
    readCreated.setUTCFullYear(1999);
    expect(entity.getCreatedAt().toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });

  it('considers same class + same id equal', () => {
    const a = new TestEntity('same');
    const b = new TestEntity('same');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(a)).toBe(true);
  });

  it('considers different ids unequal', () => {
    expect(new TestEntity('a').equals(new TestEntity('b'))).toBe(false);
  });

  it('returns false for null/undefined comparison', () => {
    const entity = new TestEntity('a');
    expect(entity.equals(null)).toBe(false);
    expect(entity.equals(undefined)).toBe(false);
  });

  it('returns false for different entity classes with same id', () => {
    expect(
      new TestEntity('x').equals(new OtherEntity('x') as Entity<string>),
    ).toBe(false);
  });

  it('supports branded ids with equals()', () => {
    const a = new BrandedEntity(new BrandedId('1'));
    const b = new BrandedEntity(new BrandedId('1'));
    const c = new BrandedEntity(new BrandedId('2'));
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  it('falls back to Object.is for object ids without equals()', () => {
    class PlainId {
      public constructor(public readonly value: string) {}
    }
    class PlainEntity extends Entity<PlainId> {
      public constructor(id: PlainId) {
        super(id, new Date(), new Date());
      }
    }
    const shared = new PlainId('same');
    expect(new PlainEntity(shared).equals(new PlainEntity(shared))).toBe(true);
    expect(
      new PlainEntity(new PlainId('a')).equals(
        new PlainEntity(new PlainId('a')),
      ),
    ).toBe(false);
  });

  it('treats non-true equals() results as unequal', () => {
    class WeirdId {
      public constructor(public readonly value: string) {}
      public equals(_other: WeirdId): unknown {
        return this.value;
      }
    }
    class WeirdEntity extends Entity<WeirdId> {
      public constructor(id: WeirdId) {
        super(id, new Date(), new Date());
      }
    }
    expect(
      new WeirdEntity(new WeirdId('yes')).equals(
        new WeirdEntity(new WeirdId('yes')),
      ),
    ).toBe(false);
  });

  it('supports numeric ids via Object.is', () => {
    expect(new NumericEntity(1).equals(new NumericEntity(1))).toBe(true);
    expect(new NumericEntity(1).equals(new NumericEntity(2))).toBe(false);
  });

  it('records and clears domain events', () => {
    const entity = new TestEntity('e1');
    entity.recordEvent(new TestDomainEvent('e1'));
    expect(entity.getDomainEvents()).toHaveLength(1);
    const snapshot = entity.getDomainEvents();
    entity.clearDomainEvents();
    expect(entity.getDomainEvents()).toHaveLength(0);
    expect(snapshot).toHaveLength(1);
  });

  it('updates updatedAt via touch', () => {
    const entity = new TestEntity(
      'e1',
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-01T00:00:00.000Z'),
    );
    const later = new Date('2026-06-01T00:00:00.000Z');
    entity.bump(later);
    expect(entity.getUpdatedAt().getTime()).toBe(later.getTime());
    later.setUTCFullYear(1999);
    expect(entity.getUpdatedAt().toISOString()).toBe(
      '2026-06-01T00:00:00.000Z',
    );
  });

  it('touches with current time when no argument is provided', () => {
    const entity = new TestEntity(
      'e1',
      new Date('2020-01-01T00:00:00.000Z'),
      new Date('2020-01-01T00:00:00.000Z'),
    );
    const before = Date.now();
    entity.bump();
    expect(entity.getUpdatedAt().getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe('AggregateRoot', () => {
  it('records creation events', () => {
    const agg = TestAggregate.create('agg-1', 'alpha');
    expect(agg.getDomainEvents()).toHaveLength(1);
    expect(agg.getDomainEvents()[0].eventName).toBe('test.created');
  });

  it('pullDomainEvents returns and clears', () => {
    const agg = TestAggregate.create('agg-1', 'alpha');
    agg.rename('beta');
    const pulled = agg.pullDomainEvents();
    expect(pulled).toHaveLength(2);
    expect(agg.getDomainEvents()).toHaveLength(0);
    expect(agg.getName()).toBe('beta');
    expect(agg.getUpdatedAt().toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });

  it('clearEvents empties the buffer', () => {
    const agg = TestAggregate.create('agg-1', 'alpha');
    agg.clearEvents();
    expect(agg.getDomainEvents()).toHaveLength(0);
  });
});

describe('ValueObject', () => {
  it('creates immutable money values', () => {
    const money = Money.create(100, 'USD');
    expect(money.unpack()).toEqual({ amount: 100, currency: 'USD' });
    expect(Object.isFrozen(money)).toBe(true);
  });

  it('equals structurally equal values', () => {
    expect(Money.create(10, 'USD').equals(Money.create(10, 'USD'))).toBe(true);
  });

  it('rejects unequal values', () => {
    expect(Money.create(10, 'USD').equals(Money.create(11, 'USD'))).toBe(false);
    expect(Money.create(10, 'USD').equals(Money.create(10, 'EUR'))).toBe(false);
  });

  it('returns false for null and different constructors', () => {
    const money = Money.create(1, 'USD');
    expect(money.equals(null)).toBe(false);
    expect(money.equals(undefined)).toBe(false);
    expect(money.equals(OtherMoney.create(1, 'USD') as unknown as Money)).toBe(
      false,
    );
  });

  it('supports reference equality short-circuit', () => {
    const money = Money.create(5, 'USD');
    expect(money.equals(money)).toBe(true);
  });

  it('fails invalid construction', () => {
    expect(() => Money.create(Number.NaN, 'USD')).toThrow(
      'Amount must be finite',
    );
    expect(() => Money.create(1, 'US')).toThrow(
      'Currency must be a 3-letter code',
    );
  });

  it('supports scalar value objects', () => {
    expect(ScalarVO.of('a').equals(ScalarVO.of('a'))).toBe(true);
    expect(ScalarVO.of('a').equals(ScalarVO.of('b'))).toBe(false);
    expect(ScalarVO.of('a').unpack()).toBe('a');
  });

  it('deep-freezes nested props and compares structurally', () => {
    class Nested extends ValueObject<{ tags: string[]; when: Date }> {
      private constructor(props: { tags: string[]; when: Date }) {
        super(props);
      }

      public static create(tags: string[], when: Date): Nested {
        return new Nested({ tags, when });
      }
    }

    const when = new Date('2026-01-01T00:00:00.000Z');
    const tags = ['a'];
    const left = Nested.create(tags, when);
    tags.push('mutated');
    when.setUTCFullYear(1999);
    expect(left.unpack().tags).toEqual(['a']);
    expect(Object.isFrozen(left.unpack().tags)).toBe(true);
    expect(
      left.equals(Nested.create(['a'], new Date('2026-01-01T00:00:00.000Z'))),
    ).toBe(true);
    expect(
      left.equals(Nested.create(['b'], new Date('2026-01-01T00:00:00.000Z'))),
    ).toBe(false);
  });

  it('rejects unsupported mutable complex props', () => {
    class BadMap extends ValueObject<{ values: Map<string, number> }> {
      private constructor(props: { values: Map<string, number> }) {
        super(props);
      }

      public static create(values: Map<string, number>): BadMap {
        return new BadMap({ values });
      }
    }

    expect(() => BadMap.create(new Map([['a', 1]]))).toThrow(TypeError);
    expect(
      () =>
        new (class extends ValueObject<{ values: Set<number> }> {
          public constructor() {
            super({ values: new Set([1]) });
          }
        })(),
    ).toThrow(TypeError);
    expect(
      () =>
        new (class extends ValueObject<{ pattern: RegExp }> {
          public constructor() {
            super({ pattern: /abc/ });
          }
        })(),
    ).toThrow(TypeError);
    expect(
      () =>
        new (class extends ValueObject<{ bytes: Buffer }> {
          public constructor() {
            super({ bytes: Buffer.from('x') });
          }
        })(),
    ).toThrow(TypeError);
  });

  it('rejects cyclic props and reuses shared nested references when freezing', () => {
    class Cyclic extends ValueObject<{ node: Record<string, unknown> }> {
      private constructor(props: { node: Record<string, unknown> }) {
        super(props);
      }

      public static create(node: Record<string, unknown>): Cyclic {
        return new Cyclic({ node });
      }
    }

    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => Cyclic.create(cycle)).toThrow(/cycles/);

    class Shared extends ValueObject<{
      left: { n: number };
      right: { n: number };
    }> {
      private constructor(props: {
        left: { n: number };
        right: { n: number };
      }) {
        super(props);
      }

      public static create(shared: { n: number }): Shared {
        return new Shared({ left: shared, right: shared });
      }
    }

    const nested = { n: 7 };
    const vo = Shared.create(nested);
    nested.n = 99;
    expect(vo.unpack().left.n).toBe(7);
    expect(vo.unpack().right.n).toBe(7);
  });

  it('returns false when equality component lengths differ', () => {
    class WeirdVO extends ValueObject<{ n: number; flag: boolean }> {
      private constructor(props: { n: number; flag: boolean }) {
        super(props);
      }

      public static create(n: number, flag: boolean): WeirdVO {
        return new WeirdVO({ n, flag });
      }

      protected getEqualityComponents(): ReadonlyArray<unknown> {
        return this.unpack().flag
          ? [this.unpack().n]
          : [this.unpack().n, this.unpack().flag];
      }
    }

    expect(WeirdVO.create(1, true).equals(WeirdVO.create(1, false))).toBe(
      false,
    );
  });

  it('compares cyclic and mismatched equality components safely', () => {
    class CycleVO extends ValueObject<{ label: string }> {
      private constructor(props: { label: string }) {
        super(props);
      }

      public static create(label: string): CycleVO {
        return new CycleVO({ label });
      }

      protected getEqualityComponents(): ReadonlyArray<unknown> {
        const node: Record<string, unknown> = { label: this.unpack().label };
        node.self = node;
        return [node];
      }
    }

    expect(CycleVO.create('a').equals(CycleVO.create('a'))).toBe(true);
    expect(CycleVO.create('a').equals(CycleVO.create('b'))).toBe(false);

    class ShapeVO extends ValueObject<{ kind: string }> {
      private constructor(props: { kind: string }) {
        super(props);
      }

      public static create(kind: string): ShapeVO {
        return new ShapeVO({ kind });
      }

      protected getEqualityComponents(): ReadonlyArray<unknown> {
        if (this.unpack().kind === 'array') {
          return [[1]];
        }
        if (this.unpack().kind === 'short') {
          return [{ a: 1 }];
        }
        return [{ a: 1, b: 2 }];
      }
    }

    expect(ShapeVO.create('array').equals(ShapeVO.create('short'))).toBe(false);
    expect(ShapeVO.create('short').equals(ShapeVO.create('long'))).toBe(false);
  });
});
