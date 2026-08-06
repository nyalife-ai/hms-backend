import type {
  DocumentContent,
  DocumentGenerator,
  DocumentMetadata,
  DocumentSection,
  DocumentTableModel,
} from '../interfaces/document-generator.interface';
import type { TemplateEngine } from '../interfaces/template-engine.interface';
import { escapeMarkup } from '../markup-escape.util';
import { applyTemplate } from './document-content.util';

export interface HtmlGenerateOptions {
  readonly content: DocumentContent;
  readonly metadata?: DocumentMetadata;
  /** Inline CSS injected into the document `<style>` tag. */
  readonly stylesheet?: string;
  readonly templateEngine?: TemplateEngine;
  readonly templateContext?: Readonly<Record<string, unknown>>;
}

const DEFAULT_STYLESHEET =
  'body{font-family:Arial,Helvetica,sans-serif;margin:2rem;color:#222;}' +
  'table{border-collapse:collapse;width:100%;margin:1rem 0;}' +
  'th,td{border:1px solid #ccc;padding:0.4rem 0.6rem;text-align:left;}' +
  'th{background:#f5f5f5;}';

export class HtmlGenerator implements DocumentGenerator<HtmlGenerateOptions> {
  public readonly format = 'html';

  public generate(options: HtmlGenerateOptions): Promise<Buffer> {
    const content = applyTemplate(
      options.content,
      options.templateEngine,
      options.templateContext,
    );
    const html = this.render(content, options);
    return Promise.resolve(Buffer.from(html, 'utf8'));
  }

  private render(
    content: DocumentContent,
    options: HtmlGenerateOptions,
  ): string {
    const title = content.title ?? options.metadata?.title ?? 'Document';
    const body = content.sections
      .map((section) => this.renderSection(section))
      .join('\n');
    return [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="UTF-8" />',
      `<title>${escapeMarkup(title)}</title>`,
      `<style>${options.stylesheet ?? DEFAULT_STYLESHEET}</style>`,
      '</head>',
      '<body>',
      `<h1>${escapeMarkup(title)}</h1>`,
      body,
      '</body>',
      '</html>',
    ].join('\n');
  }

  private renderSection(section: DocumentSection): string {
    const parts: string[] = [];
    if (section.heading) {
      parts.push(`<h2>${escapeMarkup(section.heading)}</h2>`);
    }
    for (const paragraph of section.paragraphs ?? []) {
      parts.push(`<p>${escapeMarkup(paragraph)}</p>`);
    }
    if (section.table) {
      parts.push(this.renderTable(section.table));
    }
    return parts.join('\n');
  }

  private renderTable(table: DocumentTableModel): string {
    const headerRow = table.headers
      .map((header) => `<th>${escapeMarkup(header)}</th>`)
      .join('');
    const bodyRows = table.rows
      .map(
        (row) =>
          `<tr>${row.map((cell) => `<td>${escapeMarkup(cell)}</td>`).join('')}</tr>`,
      )
      .join('');
    return `<table><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table>`;
  }
}
