export type ProviderToken =
  string | symbol | (abstract new (...args: never[]) => unknown);

export interface ProviderOverride {
  readonly token: ProviderToken;
  readonly value: unknown;
}

export class TestModuleBuilder {
  private readonly overrides = new Map<ProviderToken, unknown>();

  public override<T>(token: ProviderToken, value: T): this {
    this.overrides.set(token, value);
    return this;
  }

  public overrideMany(overrides: readonly ProviderOverride[]): this {
    for (const override of overrides) {
      this.override(override.token, override.value);
    }
    return this;
  }

  public get<T>(token: ProviderToken): T | undefined {
    return this.overrides.get(token) as T | undefined;
  }

  public build(): ReadonlyMap<ProviderToken, unknown> {
    return new Map(this.overrides);
  }
}
