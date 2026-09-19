/**
 * Shared "attached clinical images" appendix builder for DOCX reports.
 * Used by both the Radiology and Laboratory report generators so the two
 * modules don't grow separate, diverging image-embedding logic.
 *
 * Behavior mandated by the reporting brief:
 *  - images are embedded as real bytes (never a URL/link — the document
 *    must remain useful with the original storage offline);
 *  - aspect ratio is always preserved, never upscaled;
 *  - a single image gets a full-width block; two or more are laid out as a
 *    borderless 2-column grid so multiple images read as a deliberate
 *    appendix rather than a random dump;
 *  - a format docx.js cannot embed (anything other than PNG/JPEG/GIF/BMP —
 *    e.g. WebP) fails that one image with a visible in-document notice
 *    instead of silently omitting it or crashing the whole report.
 */

import {
  AlignmentType,
  BorderStyle,
  HeadingLevel,
  ImageRun,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { fitWithin, getImageDimensions } from './image-dimensions.util';

export type ReportAttachment = {
  /** Omit (or leave undefined) together with `fetchError` when the bytes could not be retrieved. */
  buffer?: Buffer;
  mimeType: string | null;
  fileName: string;
  /** Short subtitle under the image, e.g. modality/series description — omit if unknown, never invent one. */
  caption?: string | null;
  /** Set when the source bytes could not be read (storage error) — renders a notice instead of the image. */
  fetchError?: string | null;
};

const DOCX_IMAGE_TYPES: Record<string, 'png' | 'jpg' | 'gif' | 'bmp'> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/x-ms-bmp': 'bmp',
};

// Printable area for a US-Letter page with the default 1440-twip margins,
// expressed in docx.js's image-transformation pixel units (96 px/in).
const PAGE_PRINTABLE_WIDTH_PX = 624;
const SINGLE_MAX_HEIGHT_PX = 760;
const GRID_CELL_MAX_WIDTH_PX = 288;
const GRID_CELL_MAX_HEIGHT_PX = 380;

function captionParagraph(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 60, after: 200 },
    children: [new TextRun({ text, italics: true, size: 16, color: '555555' })],
  });
}

function unembeddableNotice(fileName: string, reason: string): Paragraph[] {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 40 },
      children: [
        new TextRun({
          text: `[Unable to embed image: ${fileName} — ${reason}]`,
          italics: true,
          color: 'B45309',
          size: 18,
        }),
      ],
    }),
    captionParagraph(fileName),
  ];
}

function imageBlock(attachment: ReportAttachment, maxWidth: number, maxHeight: number): Paragraph[] {
  if (attachment.fetchError || !attachment.buffer) {
    return unembeddableNotice(attachment.fileName, attachment.fetchError || 'file could not be retrieved');
  }
  const type = attachment.mimeType ? DOCX_IMAGE_TYPES[attachment.mimeType.toLowerCase()] : undefined;
  if (!type) {
    return unembeddableNotice(
      attachment.fileName,
      `unsupported format${attachment.mimeType ? ` (${attachment.mimeType})` : ''} for document embedding`,
    );
  }
  const nativeDims = getImageDimensions(attachment.buffer);
  if (!nativeDims) {
    return unembeddableNotice(attachment.fileName, 'could not read image dimensions');
  }
  const { width, height } = fitWithin(nativeDims, maxWidth, maxHeight);
  const paragraphs = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: attachment.caption ? 20 : 120 },
      children: [
        new ImageRun({
          type,
          data: attachment.buffer,
          transformation: { width, height },
        }),
      ],
    }),
  ];
  if (attachment.caption?.trim()) {
    paragraphs.push(captionParagraph(attachment.caption.trim()));
  }
  return paragraphs;
}

/**
 * Builds the appendix section (heading + page break already applied by the
 * caller) for a list of attachments. Returns an empty array when there are
 * no attachments — callers should skip the page break entirely in that case.
 */
export function buildImageAppendix(title: string, attachments: ReportAttachment[]): (Paragraph | Table)[] {
  if (!attachments.length) return [];

  const blocks: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 240 },
      children: [new TextRun({ text: title, bold: true, size: 26 })],
    }),
  ];

  if (attachments.length === 1) {
    blocks.push(...imageBlock(attachments[0], PAGE_PRINTABLE_WIDTH_PX, SINGLE_MAX_HEIGHT_PX));
    return blocks;
  }

  // 2-column grid, borderless — a deliberate appendix layout, not a table.
  for (let i = 0; i < attachments.length; i += 2) {
    const left = attachments[i];
    const right = attachments[i + 1];
    blocks.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                children: imageBlock(left, GRID_CELL_MAX_WIDTH_PX, GRID_CELL_MAX_HEIGHT_PX),
              }),
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                children: right
                  ? imageBlock(right, GRID_CELL_MAX_WIDTH_PX, GRID_CELL_MAX_HEIGHT_PX)
                  : [new Paragraph({ children: [] })],
              }),
            ],
          }),
        ],
      }),
    );
  }
  return blocks;
}
