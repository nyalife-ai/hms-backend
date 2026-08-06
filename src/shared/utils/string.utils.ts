const words = (value: string): readonly string[] =>
  value
    .normalize('NFKD')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

export const capitalize = (value: string): string =>
  value.length === 0 ? value : value[0].toLocaleUpperCase() + value.slice(1);
export const camelCase = (value: string): string => {
  const parts = words(value);
  return parts
    .map((part, index) =>
      index === 0
        ? part.toLocaleLowerCase()
        : capitalize(part.toLocaleLowerCase()),
    )
    .join('');
};
export const snakeCase = (value: string): string =>
  words(value)
    .map((part) => part.toLocaleLowerCase())
    .join('_');
export const kebabCase = (value: string): string =>
  words(value)
    .map((part) => part.toLocaleLowerCase())
    .join('-');
export const truncate = (
  value: string,
  maxLength: number,
  ellipsis = '…',
): string => {
  if (maxLength < 0) throw new RangeError('Maximum length cannot be negative');
  if (value.length <= maxLength) return value;
  if (ellipsis.length >= maxLength) return ellipsis.slice(0, maxLength);
  return value.slice(0, maxLength - ellipsis.length) + ellipsis;
};
export const slugify = (value: string): string =>
  kebabCase(value.normalize('NFKD').replace(/\p{M}/gu, ''));
/**
 * Removes basic HTML tags for display normalization only.
 *
 * This is **not** XSS sanitization. Prefer the platform `SanitizerService`
 * (or another dedicated HTML sanitizer) when handling untrusted input for
 * security-sensitive surfaces.
 */
export const removeBasicHtmlTags = (value: string): string =>
  value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<[^>]*>/g, '');

/**
 * @deprecated Use {@link removeBasicHtmlTags}. Kept as an alias for display
 * normalization only — **not** XSS sanitization. Prefer the platform sanitizer
 * for security.
 */
export const stripHtml = removeBasicHtmlTags;
export const padStartSafe = (
  value: string,
  targetLength: number,
  fill = ' ',
): string =>
  fill.length === 0 ? value : value.padStart(Math.max(0, targetLength), fill);
export const isBlank = (value: string | null | undefined): boolean =>
  value === null || value === undefined || value.trim().length === 0;
export const maskSecret = (
  value: string,
  visibleStart = 0,
  visibleEnd = 0,
  mask = '*',
): string => {
  const start = Math.max(0, visibleStart);
  const end = Math.max(0, visibleEnd);
  if (start + end >= value.length) return mask.repeat(value.length);
  return (
    value.slice(0, start) +
    mask.repeat(value.length - start - end) +
    (end === 0 ? '' : value.slice(-end))
  );
};
