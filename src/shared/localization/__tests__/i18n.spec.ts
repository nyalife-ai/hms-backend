import { I18n } from '../i18n';

describe('I18n', () => {
  const catalogs = {
    en: { greeting: 'Hello, {name}!', farewell: 'Bye' },
    fr: { greeting: 'Bonjour, {name}!' },
  };

  it('validates default and fallback locales exist', () => {
    expect(() => new I18n({ catalogs, defaultLocale: 'de' })).toThrow(
      'defaultLocale',
    );
    expect(
      () => new I18n({ catalogs, defaultLocale: 'en', fallbackLocale: 'de' }),
    ).toThrow('fallbackLocale');
    expect(
      () => new I18n({ catalogs, defaultLocale: 'en', fallbackLocale: 'fr' }),
    ).not.toThrow();
  });

  it('lists available locales and checks key presence', () => {
    const i18n = new I18n({ catalogs, defaultLocale: 'en' });
    expect(i18n.availableLocales()).toEqual(['en', 'fr']);
    expect(i18n.hasKey('en', 'greeting')).toBe(true);
    expect(i18n.hasKey('fr', 'farewell')).toBe(false);
    expect(i18n.hasKey('de', 'greeting')).toBe(false);
  });

  it('translates using the default locale and interpolates params', () => {
    const i18n = new I18n({ catalogs, defaultLocale: 'en' });
    expect(i18n.t('greeting', undefined, { name: 'Ada' })).toBe('Hello, Ada!');
    expect(i18n.t('farewell')).toBe('Bye');
    expect(i18n.t('greeting', 'fr', { name: 'Ada' })).toBe('Bonjour, Ada!');
  });

  it('falls back to the fallback locale when a key is missing', () => {
    const i18n = new I18n({
      catalogs,
      defaultLocale: 'en',
      fallbackLocale: 'en',
    });
    expect(i18n.t('farewell', 'fr')).toBe('Bye');
  });

  it('throws when a key is missing entirely', () => {
    const i18n = new I18n({ catalogs, defaultLocale: 'en' });
    expect(() => i18n.t('missing')).toThrow('Missing translation');
    const withFallback = new I18n({
      catalogs,
      defaultLocale: 'en',
      fallbackLocale: 'fr',
    });
    expect(() => withFallback.t('missing')).toThrow('Missing translation');
  });

  it('throws when an interpolation param is missing', () => {
    const i18n = new I18n({ catalogs, defaultLocale: 'en' });
    expect(() => i18n.t('greeting')).toThrow('Missing param "name"');
  });
});
