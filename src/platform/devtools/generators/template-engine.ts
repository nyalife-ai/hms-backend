export class TemplateEngine {
  public render(
    template: string,
    variables: Readonly<Record<string, string>>,
  ): string {
    return template.replace(
      /\{\{\{?([A-Za-z][A-Za-z0-9_]*)\}?\}\}/g,
      (placeholder: string, name: string): string => {
        const value = variables[name];
        if (value === undefined) {
          throw new Error(`Missing template variable: ${name}`);
        }
        return placeholder.startsWith('{{{') ? value : this.escape(value);
      },
    );
  }

  private escape(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}
