import type { PermissionEvaluator } from './permission-evaluator';
import type { Action, Principal, Resource } from './types';

class ResourceAuthorization {
  public constructor(
    private readonly principal: Principal,
    private readonly action: Action,
    private readonly evaluator: PermissionEvaluator,
  ) {}

  public on(resource: Resource): Promise<boolean> {
    return this.evaluator.can({
      principal: this.principal,
      action: this.action,
      resource,
    });
  }
}

class ActionAuthorization {
  public constructor(
    private readonly principal: Principal,
    private readonly evaluator: PermissionEvaluator,
  ) {}

  public perform(action: Action): ResourceAuthorization {
    return new ResourceAuthorization(this.principal, action, this.evaluator);
  }
}

export function Can(
  principal: Principal,
  evaluator: PermissionEvaluator,
): ActionAuthorization {
  return new ActionAuthorization(principal, evaluator);
}
