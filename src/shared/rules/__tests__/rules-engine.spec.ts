import { Condition, RulesEngine, evaluateConditionNode } from '../rules-engine';

describe('evaluateConditionNode', () => {
  const facts = {
    order: { total: 100, tags: ['vip', 'rush'], region: 'KE' },
    customer: null,
  };

  it('evaluates dot-path fields, returning undefined through null or non-object values', () => {
    expect(
      evaluateConditionNode(
        { field: 'order.total', operator: 'eq', value: 100 },
        facts,
      ),
    ).toBe(true);
    expect(
      evaluateConditionNode(
        { field: 'customer.name', operator: 'exists' },
        facts,
      ),
    ).toBe(false);
    expect(
      evaluateConditionNode(
        { field: 'order.total.cents', operator: 'exists' },
        facts,
      ),
    ).toBe(false);
  });

  it('supports equality, comparison, membership and existence operators', () => {
    expect(
      evaluateConditionNode(
        { field: 'order.total', operator: 'neq', value: 1 },
        facts,
      ),
    ).toBe(true);
    expect(
      evaluateConditionNode(
        { field: 'order.total', operator: 'gt', value: 50 },
        facts,
      ),
    ).toBe(true);
    expect(
      evaluateConditionNode(
        { field: 'order.total', operator: 'gte', value: 100 },
        facts,
      ),
    ).toBe(true);
    expect(
      evaluateConditionNode(
        { field: 'order.total', operator: 'lt', value: 200 },
        facts,
      ),
    ).toBe(true);
    expect(
      evaluateConditionNode(
        { field: 'order.total', operator: 'lte', value: 100 },
        facts,
      ),
    ).toBe(true);
    expect(
      evaluateConditionNode(
        { field: 'order.region', operator: 'gt', value: 1 },
        facts,
      ),
    ).toBe(false);
    expect(
      evaluateConditionNode(
        { field: 'order.region', operator: 'in', value: ['KE', 'UG'] },
        facts,
      ),
    ).toBe(true);
    expect(
      evaluateConditionNode(
        { field: 'order.region', operator: 'nin', value: ['UG'] },
        facts,
      ),
    ).toBe(true);
    expect(
      evaluateConditionNode(
        { field: 'order.region', operator: 'in', value: 'not-an-array' },
        facts,
      ),
    ).toBe(false);
    expect(
      evaluateConditionNode(
        { field: 'order.region', operator: 'nin', value: 'not-an-array' },
        facts,
      ),
    ).toBe(false);
    expect(
      evaluateConditionNode(
        { field: 'order.tags', operator: 'contains', value: 'vip' },
        facts,
      ),
    ).toBe(true);
    expect(
      evaluateConditionNode(
        { field: 'order.region', operator: 'contains', value: 'K' },
        facts,
      ),
    ).toBe(false);
    expect(
      evaluateConditionNode(
        { field: 'order.total', operator: 'exists' },
        facts,
      ),
    ).toBe(true);
  });

  it('throws on unknown operators', () => {
    const condition = {
      field: 'order.total',
      operator: 'between',
      value: [1, 2],
    } as unknown as Condition;
    expect(() => evaluateConditionNode(condition, facts)).toThrow(
      'Unknown rule condition operator',
    );
  });

  it('combines conditions with all/any/not', () => {
    expect(
      evaluateConditionNode(
        {
          all: [
            { field: 'order.total', operator: 'gt', value: 50 },
            { field: 'order.region', operator: 'eq', value: 'KE' },
          ],
        },
        facts,
      ),
    ).toBe(true);
    expect(
      evaluateConditionNode(
        {
          any: [
            { field: 'order.region', operator: 'eq', value: 'US' },
            { field: 'order.region', operator: 'eq', value: 'KE' },
          ],
        },
        facts,
      ),
    ).toBe(true);
    expect(
      evaluateConditionNode(
        { not: { field: 'order.region', operator: 'eq', value: 'US' } },
        facts,
      ),
    ).toBe(true);
  });
});

describe('RulesEngine', () => {
  const facts = { order: { total: 150, region: 'KE' } };

  it('evaluates matching rules in priority order', () => {
    const engine = new RulesEngine<string>([
      {
        id: 'low',
        priority: 1,
        when: { field: 'order.total', operator: 'gt', value: 0 },
        then: 'low-priority-match',
      },
      {
        id: 'high',
        priority: 10,
        when: { field: 'order.region', operator: 'eq', value: 'KE' },
        then: 'high-priority-match',
      },
      {
        id: 'no-match',
        when: { field: 'order.region', operator: 'eq', value: 'US' },
        then: 'never',
      },
    ]);
    const matches = engine.evaluate(facts);
    expect(matches.map((rule) => rule.id)).toEqual(['high', 'low']);
    expect(engine.firstMatch(facts)?.id).toBe('high');
  });

  it('returns undefined from firstMatch when nothing matches', () => {
    const engine = new RulesEngine<string>([
      {
        id: 'never',
        when: { field: 'order.region', operator: 'eq', value: 'US' },
        then: 'never',
      },
    ]);
    expect(engine.firstMatch(facts)).toBeUndefined();
    expect(engine.evaluate(facts)).toEqual([]);
  });

  it('runs an executor for every matching rule in priority order', () => {
    const engine = new RulesEngine<string>([
      {
        id: 'a',
        priority: 1,
        when: { field: 'order.total', operator: 'gt', value: 0 },
        then: 'action-a',
      },
      {
        id: 'b',
        priority: 5,
        when: { field: 'order.total', operator: 'gt', value: 0 },
        then: 'action-b',
      },
    ]);
    const executed: string[] = [];
    engine.run(facts, (action) => executed.push(action));
    expect(executed).toEqual(['action-b', 'action-a']);
  });

  it('defaults missing priorities to zero', () => {
    const engine = new RulesEngine<string>([
      {
        id: 'a',
        when: { field: 'order.total', operator: 'exists' },
        then: 'a',
      },
      {
        id: 'b',
        priority: 0,
        when: { field: 'order.total', operator: 'exists' },
        then: 'b',
      },
    ]);
    expect(engine.evaluate(facts).map((rule) => rule.id)).toEqual(['a', 'b']);
  });
});
