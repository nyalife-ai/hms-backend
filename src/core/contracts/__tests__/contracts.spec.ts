import {
  Result,
  Specification,
  AndSpecification,
  OrSpecification,
  NotSpecification,
} from '../index';
import type { Repository } from '../repository.interface';
import type { UnitOfWork } from '../unit-of-work.interface';
import type { Clock } from '../clock.interface';
import type { IdentifierGenerator } from '../identifier-generator.interface';

class GreaterThan extends Specification<number> {
  public constructor(private readonly threshold: number) {
    super();
  }

  public isSatisfiedBy(candidate: number): boolean {
    return candidate > this.threshold;
  }
}

class LessThan extends Specification<number> {
  public constructor(private readonly threshold: number) {
    super();
  }

  public isSatisfiedBy(candidate: number): boolean {
    return candidate < this.threshold;
  }
}

class FakeClock implements Clock {
  public constructor(private current: Date) {}

  public now(): Date {
    return this.current;
  }

  public timestamp(): number {
    return this.current.getTime();
  }

  public advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

class UuidGenerator implements IdentifierGenerator<string> {
  private seq = 0;
  public next(): string {
    this.seq += 1;
    return `id-${this.seq}`;
  }
}

class InMemoryRepo implements Repository<{ id: string; name: string }, string> {
  private readonly store = new Map<string, { id: string; name: string }>();

  public async findById(id: string) {
    return this.store.get(id) ?? null;
  }

  public async findAll() {
    return [...this.store.values()];
  }

  public async exists(id: string) {
    return this.store.has(id);
  }

  public async save(entity: { id: string; name: string }) {
    this.store.set(entity.id, entity);
    return entity;
  }

  public async delete(id: string) {
    this.store.delete(id);
  }
}

class InMemoryUow implements UnitOfWork {
  public begun = false;
  public committed = false;
  public rolledBack = false;

  public async execute<T>(work: (uow: UnitOfWork) => Promise<T>): Promise<T> {
    const handle = await this.begin();
    try {
      const result = await work(handle);
      await handle.commit();
      return result;
    } catch (error) {
      await handle.rollback();
      throw error;
    }
  }

  public async begin(): Promise<UnitOfWork> {
    this.begun = true;
    return this;
  }

  public async commit(): Promise<void> {
    this.committed = true;
  }

  public async rollback(): Promise<void> {
    this.rolledBack = true;
  }
}

describe('Result', () => {
  it('represents success', () => {
    const result = Result.success(42);
    expect(result.isSuccess()).toBe(true);
    expect(result.isFailure()).toBe(false);
    expect(result.getValue()).toBe(42);
    expect(result.getOrElse(0)).toBe(42);
  });

  it('represents failure', () => {
    const result = Result.failure('nope');
    expect(result.isFailure()).toBe(true);
    expect(result.getError()).toBe('nope');
    expect(result.getOrElse(7)).toBe(7);
  });

  it('ok / fail aliases work', () => {
    expect(Result.ok('x').getValue()).toBe('x');
    expect(Result.fail('e').getError()).toBe('e');
  });

  it('throws when reading the wrong side', () => {
    expect(() => Result.failure('e').getValue()).toThrow(
      'Cannot get the value of a failed Result',
    );
    expect(() => Result.success(1).getError()).toThrow(
      'Cannot get the error of a successful Result',
    );
  });

  it('maps values and errors', () => {
    expect(
      Result.success(2)
        .map((n) => n * 2)
        .getValue(),
    ).toBe(4);
    expect(
      Result.failure<number, string>('e')
        .map((n) => n * 2)
        .getError(),
    ).toBe('e');
    expect(
      Result.failure('e')
        .mapError((err) => err.toUpperCase())
        .getError(),
    ).toBe('E');
    expect(
      Result.success(1)
        .mapError((err) => err)
        .getValue(),
    ).toBe(1);
  });

  it('flatMaps and matches', () => {
    const chained = Result.success(2).flatMap((n) => Result.success(n + 1));
    expect(chained.getValue()).toBe(3);
    expect(
      Result.failure<number, string>('e')
        .flatMap((n) => Result.success(n))
        .getError(),
    ).toBe('e');
    expect(
      Result.success(1).match({
        success: (v) => `ok:${v}`,
        failure: (e) => `err:${e}`,
      }),
    ).toBe('ok:1');
    expect(
      Result.failure<number>('x').match({
        success: (v) => `ok:${v}`,
        failure: (e) => `err:${e}`,
      }),
    ).toBe('err:x');
  });
});

describe('Specification', () => {
  const gt5 = new GreaterThan(5);
  const lt10 = new LessThan(10);

  it('evaluates atomic predicates', () => {
    expect(gt5.isSatisfiedBy(6)).toBe(true);
    expect(gt5.isSatisfiedBy(5)).toBe(false);
  });

  it('composes AND', () => {
    const range = gt5.and(lt10);
    expect(range).toBeInstanceOf(AndSpecification);
    expect(range.isSatisfiedBy(7)).toBe(true);
    expect(range.isSatisfiedBy(4)).toBe(false);
    expect(range.isSatisfiedBy(11)).toBe(false);
  });

  it('composes OR', () => {
    const either = gt5.or(new LessThan(0));
    expect(either).toBeInstanceOf(OrSpecification);
    expect(either.isSatisfiedBy(6)).toBe(true);
    expect(either.isSatisfiedBy(-1)).toBe(true);
    expect(either.isSatisfiedBy(3)).toBe(false);
  });

  it('composes NOT', () => {
    const notGt5 = gt5.not();
    expect(notGt5).toBeInstanceOf(NotSpecification);
    expect(notGt5.isSatisfiedBy(3)).toBe(true);
    expect(notGt5.isSatisfiedBy(6)).toBe(false);
  });
});

describe('Contract adapters (ports only)', () => {
  it('Clock can be faked for deterministic time', () => {
    const clock = new FakeClock(new Date('2026-01-01T00:00:00.000Z'));
    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(clock.timestamp()).toBe(Date.parse('2026-01-01T00:00:00.000Z'));
    clock.advance(1000);
    expect(clock.timestamp()).toBe(Date.parse('2026-01-01T00:00:01.000Z'));
  });

  it('IdentifierGenerator yields sequential ids', () => {
    const ids = new UuidGenerator();
    expect(ids.next()).toBe('id-1');
    expect(ids.next()).toBe('id-2');
  });

  it('Repository port works without an ORM', async () => {
    const repo = new InMemoryRepo();
    await repo.save({ id: '1', name: 'alpha' });
    expect(await repo.exists('1')).toBe(true);
    expect(await repo.findById('1')).toEqual({ id: '1', name: 'alpha' });
    expect(await repo.findAll()).toHaveLength(1);
    await repo.delete('1');
    expect(await repo.findById('1')).toBeNull();
    expect(await repo.exists('1')).toBe(false);
  });

  it('UnitOfWork commits on success and rolls back on failure', async () => {
    const ok = new InMemoryUow();
    await ok.execute(async () => 1);
    expect(ok.begun).toBe(true);
    expect(ok.committed).toBe(true);
    expect(ok.rolledBack).toBe(false);

    const fail = new InMemoryUow();
    await expect(
      fail.execute(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(fail.rolledBack).toBe(true);
  });
});
