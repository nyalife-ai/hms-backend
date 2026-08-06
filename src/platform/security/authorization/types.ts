export type Action = string;
export type Resource = string;

export interface Principal {
  readonly id: string;
  readonly roles: readonly string[];
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface Permission {
  readonly action: Action;
  readonly resource: Resource;
}

export interface AuthorizationContext {
  readonly principal: Principal;
  readonly action: Action;
  readonly resource: Resource;
  readonly resourceAttributes?: Readonly<Record<string, unknown>>;
}
