/**
 * Minimal, purpose-built converter for the narrow HTML subset the report
 * editor's Tiptap StarterKit can produce (p, strong, em, ul/ol > li, br).
 * Never renders raw HTML/markdown into the document — every tag is turned
 * into real docx Paragraph/TextRun/numbering constructs.
 */

import { Paragraph, TextRun } from 'docx';

const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#?\w+);/g, (match, code: string) => ENTITY_MAP[code] ?? match);
}

type Run = { text: string; bold: boolean; italic: boolean };

/** Parse inline content (text + strong/em/br) into flat runs, stripping tags. */
function parseInline(html: string): Run[] {
  const runs: Run[] = [];
  let bold = 0;
  let italic = 0;
  const tagRe = /<\/?(strong|b|em|i|br)\s*\/?>/gi;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  const pushText = (raw: string) => {
    const text = decodeEntities(raw);
    if (text) runs.push({ text, bold: bold > 0, italic: italic > 0 });
  };
  while ((m = tagRe.exec(html))) {
    pushText(html.slice(lastIndex, m.index));
    const tag = m[1].toLowerCase();
    const closing = m[0].startsWith('</');
    if (tag === 'strong' || tag === 'b') bold = Math.max(0, bold + (closing ? -1 : 1));
    else if (tag === 'em' || tag === 'i') italic = Math.max(0, italic + (closing ? -1 : 1));
    else if (tag === 'br') runs.push({ text: '\n', bold: false, italic: false });
    lastIndex = tagRe.lastIndex;
  }
  pushText(html.slice(lastIndex));
  return runs;
}

function runsToTextRuns(runs: Run[]): TextRun[] {
  if (!runs.length) return [new TextRun('')];
  return runs.flatMap((r) =>
    r.text.split('\n').map(
      (line, i, arr) =>
        new TextRun({
          text: line,
          bold: r.bold,
          italics: r.italic,
          break: i > 0 ? 1 : undefined,
        }),
    ),
  );
}

export const BULLET_REF = 'html-bullet-list';
export const NUMBER_REF = 'html-number-list';

/**
 * Convert a Tiptap-produced HTML string into docx Paragraphs. Caller must
 * register `BULLET_REF`/`NUMBER_REF` in the Document's `numbering` config
 * (see radiology-report.docx.ts) for list bullets/numbers to render.
 */
export function htmlToParagraphs(html: string | null | undefined): Paragraph[] {
  const trimmed = html?.trim();
  if (!trimmed) return [];

  const paragraphs: Paragraph[] = [];

  // Walk top-level <p>/<ul>/<ol> blocks in document order.
  function walk(fragment: string): void {
    let idx = 0;
    while (idx < fragment.length) {
      const tagMatch = /<(p|ul|ol)\b[^>]*>/i.exec(fragment.slice(idx));
      if (!tagMatch) break;
      const tag = tagMatch[1].toLowerCase();
      const start = idx + tagMatch.index! + tagMatch[0].length;
      const closeTagRe = new RegExp(`</${tag}>`, 'i');
      const closeMatch = closeTagRe.exec(fragment.slice(start));
      const end = closeMatch ? start + closeMatch.index! : fragment.length;
      const inner = fragment.slice(start, end);

      if (tag === 'p') {
        paragraphs.push(new Paragraph({ children: runsToTextRuns(parseInline(inner)) }));
      } else if (tag === 'ul' || tag === 'ol') {
        walkListItems(inner, tag);
      }
      idx = end + (closeMatch ? tag.length + 3 : 0);
    }
  }

  function walkListItems(fragment: string, kind: 'ul' | 'ol'): void {
    const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let m: RegExpExecArray | null;
    while ((m = liRe.exec(fragment))) {
      // A list item's content may itself be wrapped in <p>; strip one level.
      const inner = m[1].replace(/^\s*<p[^>]*>([\s\S]*?)<\/p>\s*$/i, '$1');
      paragraphs.push(
        new Paragraph({
          children: runsToTextRuns(parseInline(inner)),
          numbering: {
            reference: kind === 'ul' ? BULLET_REF : NUMBER_REF,
            level: 0,
          },
        }),
      );
    }
  }

  // If the content has no block tags at all, treat it as one plain paragraph.
  if (!/<(p|ul|ol)\b/i.test(trimmed)) {
    paragraphs.push(new Paragraph({ children: runsToTextRuns(parseInline(trimmed)) }));
    return paragraphs;
  }

  walk(trimmed);
  return paragraphs.length ? paragraphs : [new Paragraph({ children: runsToTextRuns(parseInline(trimmed)) })];
}
