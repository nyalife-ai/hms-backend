import { assertSafeKey } from './storage-security';

export interface CdnUrlOptions {
  /** CDN origin, e.g. `https://cdn.example.com`. Trailing slashes are trimmed. */
  readonly baseUrl: string;
  /** Optional query string parameters appended to the built URL (e.g. cache-busting). */
  readonly queryParams?: Readonly<Record<string, string>>;
}

/**
 * Builds a public CDN URL for a storage key. Pure string composition — does
 * not perform signing; combine with `StorageProvider.signedUrl` when the
 * CDN requires signed requests.
 */
export function buildCdnUrl(key: string, options: CdnUrlOptions): string {
  assertSafeKey(key);
  if (options.baseUrl.trim().length === 0) {
    throw new RangeError('CDN baseUrl must not be empty');
  }
  const base = options.baseUrl.replace(/\/+$/, '');
  const encodedKey = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const query =
    options.queryParams === undefined ||
    Object.keys(options.queryParams).length === 0
      ? ''
      : `?${new URLSearchParams(options.queryParams).toString()}`;
  return `${base}/${encodedKey}${query}`;
}
