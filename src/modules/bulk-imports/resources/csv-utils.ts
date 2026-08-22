/**
 * Shared CSV helpers for all bulk importers.
 */

export function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function rowsToCsv(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((r) => r.map(escapeCsvCell).join(',')),
  ];
  return `${lines.join('\n')}\n`;
}

export function cell(
  values: Record<string, string>,
  header: string,
): string {
  return (values[header] ?? '').trim();
}
