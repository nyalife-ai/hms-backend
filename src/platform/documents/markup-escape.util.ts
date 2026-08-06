/**
 * Shared, dependency-free helpers for markup escaping and dotted-path lookups
 * used across the HTML/DOCX generators and the template engines.
 */

const ESCAPE_MAP: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

/** Escapes the five characters that are special to both HTML and XML. */
export function escapeMarkup(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ESCAPE_MAP[character]);
}

/** Renders an arbitrary value as template/document text. */
export function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  // Deliberately generic: template/context values are caller-supplied and
  // may be arbitrary objects with a meaningful custom `toString`.
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  return String(value);
}

/**
 * Resolves a dotted path (`a.b.c`) against a context object.
 * `this` and `.` resolve to the context itself, matching mustache semantics.
 */
export function resolveTemplatePath(context: unknown, path: string): unknown {
  if (path === 'this' || path === '.') {
    return context;
  }
  return path.split('.').reduce<unknown>((accumulator, key) => {
    if (
      accumulator === null ||
      accumulator === undefined ||
      typeof accumulator !== 'object'
    ) {
      return undefined;
    }
    return (accumulator as Record<string, unknown>)[key];
  }, context);
}

/** Mustache/Handlebars truthiness: `undefined`, `null`, `false`, `''`, `0` and empty arrays are falsy. */
export function isTemplateTruthy(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return Boolean(value);
}
