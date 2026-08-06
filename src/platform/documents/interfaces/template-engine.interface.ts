export const TEMPLATE_ENGINE = Symbol('TEMPLATE_ENGINE');

/** Renders a template string against a context, synchronously. */
export interface TemplateEngine {
  readonly name: string;
  render(template: string, context?: Readonly<Record<string, unknown>>): string;
}
