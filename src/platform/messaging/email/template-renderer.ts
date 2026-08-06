export class TemplateRenderer {
  public render(
    template: string,
    variables: Readonly<Record<string, unknown>>,
  ): string {
    return template.replace(
      /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g,
      (_match: string, key: string) => {
        if (!(key in variables)) {
          throw new Error(`Missing template variable: ${key}`);
        }
        return this.escape(serializeTemplateValue(variables[key]));
      },
    );
  }

  private escape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

function serializeTemplateValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return JSON.stringify(value);
}
