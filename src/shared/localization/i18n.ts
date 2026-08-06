export type MessageCatalog = Readonly<Record<string, string>>;
export type LocaleCatalogs = Readonly<Record<string, MessageCatalog>>;
export type TranslationParams = Readonly<Record<string, string | number>>;

export interface I18nOptions {
  readonly catalogs: LocaleCatalogs;
  readonly defaultLocale: string;
  /** Locale consulted when a key is missing from the requested locale's catalog. */
  readonly fallbackLocale?: string;
}

const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;

/**
 * Minimal message-catalog based translator. Catalogs are flat key→template
 * maps per locale; templates use `{param}` placeholders.
 */
export class I18n {
  public constructor(private readonly options: I18nOptions) {
    if (!options.catalogs[options.defaultLocale]) {
      throw new Error(
        `I18n defaultLocale "${options.defaultLocale}" has no catalog`,
      );
    }
    if (
      options.fallbackLocale !== undefined &&
      !options.catalogs[options.fallbackLocale]
    ) {
      throw new Error(
        `I18n fallbackLocale "${options.fallbackLocale}" has no catalog`,
      );
    }
  }

  public availableLocales(): string[] {
    return Object.keys(this.options.catalogs);
  }

  public hasKey(locale: string, key: string): boolean {
    return this.options.catalogs[locale]?.[key] !== undefined;
  }

  public t(
    key: string,
    locale: string = this.options.defaultLocale,
    params?: TranslationParams,
  ): string {
    const template = this.resolveTemplate(locale, key);
    return I18n.interpolate(key, template, params);
  }

  private resolveTemplate(locale: string, key: string): string {
    const direct = this.options.catalogs[locale]?.[key];
    if (direct !== undefined) {
      return direct;
    }
    const fallback = this.options.fallbackLocale;
    const fromFallback =
      fallback !== undefined
        ? this.options.catalogs[fallback]?.[key]
        : undefined;
    if (fromFallback !== undefined) {
      return fromFallback;
    }
    throw new Error(
      `Missing translation for key "${key}" (locale "${locale}")`,
    );
  }

  private static interpolate(
    key: string,
    template: string,
    params: TranslationParams | undefined,
  ): string {
    return template.replace(PLACEHOLDER_PATTERN, (match, name: string) => {
      const value = params?.[name];
      if (value === undefined) {
        throw new Error(`Missing param "${name}" for translation key "${key}"`);
      }
      return String(value);
    });
  }
}
