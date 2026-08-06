const normalize = (value: string): string => value.replaceAll('\\', '/');

/**
 * Throws when static imports or CommonJS requires reference a forbidden prefix.
 */
export const assertNoForbiddenImports = (
  source: string,
  forbiddenPrefixes: readonly string[],
): void => {
  const imports = source.matchAll(
    /(?:import\s+(?:[^'"]*?\s+from\s+)?|export\s+[^'"]*?\s+from\s+|require\s*\()\s*['"]([^'"]+)['"]/g,
  );

  for (const match of imports) {
    const specifier = normalize(match[1]);
    const forbidden = forbiddenPrefixes.find((prefix) => {
      const normalizedPrefix = normalize(prefix);
      return (
        specifier === normalizedPrefix ||
        specifier.startsWith(`${normalizedPrefix}/`)
      );
    });
    if (forbidden !== undefined) {
      throw new Error(
        `Forbidden dependency "${specifier}" (prefix "${forbidden}")`,
      );
    }
  }
};
