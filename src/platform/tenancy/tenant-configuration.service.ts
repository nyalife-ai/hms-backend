import { TenantContext } from './tenant-context';

export class TenantConfigurationService {
  public constructor(private readonly context: TenantContext) {}

  public settings(): Readonly<Record<string, unknown>> {
    return this.context.requireCurrent().settings;
  }

  public metadata(): Readonly<Record<string, unknown>> {
    return this.context.requireCurrent().metadata;
  }

  public getSetting<T>(key: string, defaultValue: T): T {
    return this.read<T>(this.settings(), key, defaultValue);
  }

  public getMetadata<T>(key: string, defaultValue: T): T {
    return this.read<T>(this.metadata(), key, defaultValue);
  }

  private read<T>(
    source: Readonly<Record<string, unknown>>,
    key: string,
    defaultValue: T,
  ): T {
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      return defaultValue;
    }
    return source[key] as T;
  }
}
