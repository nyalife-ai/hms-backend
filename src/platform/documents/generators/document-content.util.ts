import type {
  DocumentContent,
  DocumentSection,
} from '../interfaces/document-generator.interface';
import type { TemplateEngine } from '../interfaces/template-engine.interface';

/**
 * Renders every text field of a {@link DocumentContent} tree through a
 * {@link TemplateEngine}. Shared by the PDF/DOCX/HTML generators so template
 * support ("templates via TemplateEngine") behaves identically everywhere.
 */
export function applyTemplate(
  content: DocumentContent,
  engine?: TemplateEngine,
  context: Readonly<Record<string, unknown>> = {},
): DocumentContent {
  if (!engine) {
    return content;
  }
  const render = (text: string): string => engine.render(text, context);
  return {
    title: content.title === undefined ? undefined : render(content.title),
    sections: content.sections.map((section) => renderSection(section, render)),
  };
}

function renderSection(
  section: DocumentSection,
  render: (text: string) => string,
): DocumentSection {
  return {
    heading:
      section.heading === undefined ? undefined : render(section.heading),
    paragraphs: section.paragraphs?.map(render),
    table:
      section.table === undefined
        ? undefined
        : {
            headers: section.table.headers.map(render),
            rows: section.table.rows.map((row) => row.map(render)),
          },
  };
}
