export type ConditionOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'nin'
  | 'contains'
  | 'exists';

export interface Condition {
  /** Dot-path into the facts object, e.g. `"order.total"`. */
  readonly field: string;
  readonly operator: ConditionOperator;
  readonly value?: unknown;
}

export interface AllOf {
  readonly all: readonly ConditionNode[];
}
export interface AnyOf {
  readonly any: readonly ConditionNode[];
}
export interface NotOf {
  readonly not: ConditionNode;
}
export type ConditionNode = Condition | AllOf | AnyOf | NotOf;

export interface Rule<TAction = unknown> {
  readonly id: string;
  readonly when: ConditionNode;
  readonly then: TAction;
  /** Higher priority rules are evaluated (and matched) first. Defaults to 0. */
  readonly priority?: number;
}

function getPath(
  facts: Readonly<Record<string, unknown>>,
  path: string,
): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (value === null || typeof value !== 'object') {
      return undefined;
    }
    return (value as Record<string, unknown>)[key];
  }, facts);
}

function evaluateCondition(
  condition: Condition,
  facts: Readonly<Record<string, unknown>>,
): boolean {
  const actual = getPath(facts, condition.field);
  switch (condition.operator) {
    case 'eq':
      return actual === condition.value;
    case 'neq':
      return actual !== condition.value;
    case 'gt':
      return typeof actual === 'number' && actual > (condition.value as number);
    case 'gte':
      return (
        typeof actual === 'number' && actual >= (condition.value as number)
      );
    case 'lt':
      return typeof actual === 'number' && actual < (condition.value as number);
    case 'lte':
      return (
        typeof actual === 'number' && actual <= (condition.value as number)
      );
    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(actual);
    case 'nin':
      return (
        Array.isArray(condition.value) && !condition.value.includes(actual)
      );
    case 'contains':
      return Array.isArray(actual) && actual.includes(condition.value);
    case 'exists':
      return actual !== undefined;
    default:
      throw new Error(
        `Unknown rule condition operator: "${String(condition.operator)}"`,
      );
  }
}

function isCondition(node: ConditionNode): node is Condition {
  return 'field' in node;
}

/** Evaluates a (possibly nested) condition tree against a facts object. */
export function evaluateConditionNode(
  node: ConditionNode,
  facts: Readonly<Record<string, unknown>>,
): boolean {
  if (isCondition(node)) {
    return evaluateCondition(node, facts);
  }
  if ('all' in node) {
    return node.all.every((child) => evaluateConditionNode(child, facts));
  }
  if ('any' in node) {
    return node.any.some((child) => evaluateConditionNode(child, facts));
  }
  return !evaluateConditionNode(node.not, facts);
}

/**
 * Simple, dependency-free condition→action rules engine. This is a business
 * rules evaluator, not an authorization engine — see
 * `platform/security/authorization` for RBAC/ABAC/policy decisions.
 */
export class RulesEngine<TAction = unknown> {
  private readonly rules: readonly Rule<TAction>[];

  public constructor(rules: readonly Rule<TAction>[]) {
    this.rules = [...rules].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
    );
  }

  /** All rules whose condition matches `facts`, in priority order. */
  public evaluate(facts: Readonly<Record<string, unknown>>): Rule<TAction>[] {
    return this.rules.filter((rule) => evaluateConditionNode(rule.when, facts));
  }

  /** The highest-priority matching rule, if any. */
  public firstMatch(
    facts: Readonly<Record<string, unknown>>,
  ): Rule<TAction> | undefined {
    return this.rules.find((rule) => evaluateConditionNode(rule.when, facts));
  }

  /** Runs `executor` for every matching rule's action, in priority order. */
  public run(
    facts: Readonly<Record<string, unknown>>,
    executor: (action: TAction, rule: Rule<TAction>) => void,
  ): void {
    for (const rule of this.evaluate(facts)) {
      executor(rule.then, rule);
    }
  }
}
