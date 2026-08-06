export const SEARCH_ENGINE = Symbol('SEARCH_ENGINE');
export const SEARCH_ENGINE_OPTIONS = Symbol('SEARCH_ENGINE_OPTIONS');

/** `SEARCH_ENGINE` configuration concept. */
export type SearchEngineKind =
  'postgres' | 'elastic' | 'meilisearch' | 'memory';
