import type { TemplateEngine } from '../interfaces/template-engine.interface';
import type { ModuleResolver } from '../optional-driver';
import { tryLoadDriver } from '../optional-driver';
import {
  escapeMarkup,
  resolveTemplatePath,
  stringifyValue,
} from '../markup-escape.util';

interface MarkedModule {
  parse(markdown: string): string;
}

const VARIABLE_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * Substitutes `{{var}}` placeholders with raw (unescaped) values — the
 * Markdown-to-HTML conversion step below is responsible for HTML-escaping
 * the final text, so escaping here would double-escape entities.
 */
function substituteVariables(
  template: string,
  context: Readonly<Record<string, unknown>>,
): string {
  return template.replace(VARIABLE_PATTERN, (_match, path: string) =>
    stringifyValue(resolveTemplatePath(context, path)),
  );
}

function inline(text: string): string {
  return escapeMarkup(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*(.+?)\*(?!\*)/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
}

/** Minimal, dependency-free Markdown-to-HTML conversion (headings, lists, paragraphs, inline emphasis/code/links). */
function convertMarkdown(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const htmlParts: string[] = [];
  let listOpen = false;
  let paragraphLines: string[] = [];

  const flushParagraph = (): void => {
    if (paragraphLines.length > 0) {
      htmlParts.push(`<p>${inline(paragraphLines.join(' '))}</p>`);
      paragraphLines = [];
    }
  };
  const closeList = (): void => {
    if (listOpen) {
      htmlParts.push('</ul>');
      listOpen = false;
    }
  };

  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const listItem = /^[-*]\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      htmlParts.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    } else if (listItem) {
      flushParagraph();
      if (!listOpen) {
        htmlParts.push('<ul>');
        listOpen = true;
      }
      htmlParts.push(`<li>${inline(listItem[1])}</li>`);
    } else if (line.trim().length === 0) {
      flushParagraph();
      closeList();
    } else {
      paragraphLines.push(line.trim());
    }
  }
  flushParagraph();
  closeList();
  return htmlParts.join('\n');
}

/**
 * Renders `{{var}}` substitution followed by Markdown-to-HTML conversion.
 * Uses the real `marked` package when installed; otherwise falls back to a
 * minimal, dependency-free converter covering headings/lists/paragraphs/
 * inline emphasis, code and links.
 */
export class MarkdownTemplateEngine implements TemplateEngine {
  public readonly name = 'markdown';

  public constructor(private readonly resolver?: ModuleResolver) {}

  public render(
    template: string,
    context: Readonly<Record<string, unknown>> = {},
  ): string {
    const substituted = substituteVariables(template, context);
    const marked = tryLoadDriver<MarkedModule>('marked', this.resolver);
    if (marked) {
      return marked.parse(substituted);
    }
    return convertMarkdown(substituted);
  }
}
