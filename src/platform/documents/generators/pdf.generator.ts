import PDFDocument from 'pdfkit';
import type {
  DocumentContent,
  DocumentGenerator,
  DocumentMetadata,
  DocumentSecurityHook,
  DocumentTableModel,
  PageContext,
  QrCodeOptions,
} from '../interfaces/document-generator.interface';
import type { TemplateEngine } from '../interfaces/template-engine.interface';
import type { ModuleResolver } from '../optional-driver';
import { tryLoadDriver } from '../optional-driver';
import { applyTemplate } from './document-content.util';

/** Draws on (or reads geometry from) the current page during decoration passes. */
export type PdfDecorationHook = (
  doc: PDFKit.PDFDocument,
  context: PageContext,
) => void;

interface QrCodeModule {
  toBuffer(
    text: string,
    options: Readonly<Record<string, unknown>>,
  ): Promise<Buffer>;
}

export interface PdfGenerateOptions {
  readonly content: DocumentContent;
  readonly metadata?: DocumentMetadata;
  /** Draws a default "Page X of Y" footer on every page. */
  readonly pageNumbering?: boolean;
  /** Called once per page during the decoration pass; draw whatever header you need. */
  readonly header?: PdfDecorationHook;
  /** Called once per page during the decoration pass; draw whatever footer you need. */
  readonly footer?: PdfDecorationHook;
  /** Called once per page during the decoration pass; draw a watermark if desired. */
  readonly watermark?: PdfDecorationHook;
  /** Embeds a QR code (via the optional `qrcode` driver) on the first page. */
  readonly qrCode?: QrCodeOptions;
  /** Post-processing hook for digital signature. No-op by default. */
  readonly sign?: DocumentSecurityHook;
  /** Post-processing hook for encryption. No-op by default. */
  readonly encrypt?: DocumentSecurityHook;
  readonly templateEngine?: TemplateEngine;
  readonly templateContext?: Readonly<Record<string, unknown>>;
}

const PAGE_MARGIN = 50;
const identityHook: DocumentSecurityHook = (buffer) => buffer;

export class PdfGenerator implements DocumentGenerator<PdfGenerateOptions> {
  public readonly format = 'pdf';

  public constructor(private readonly resolver?: ModuleResolver) {}

  public async generate(options: PdfGenerateOptions): Promise<Buffer> {
    const content = applyTemplate(
      options.content,
      options.templateEngine,
      options.templateContext,
    );
    const rendered = await this.renderDocument(content, options);
    const signed = await (options.sign ?? identityHook)(rendered);
    return (options.encrypt ?? identityHook)(signed);
  }

  private renderDocument(
    content: DocumentContent,
    options: PdfGenerateOptions,
  ): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        margin: PAGE_MARGIN,
        bufferPages: true,
        info: this.buildInfo(options.metadata),
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('error', reject);
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      this.writeContent(doc, content);
      this.decoratePages(doc, options)
        .then(() => doc.end())
        .catch(reject);
    });
  }

  /**
   * pdfkit's file-ID generator iterates every own key of `info` and calls
   * `.valueOf()` on each value, so keys must never be present with an
   * `undefined` value — hence building the object conditionally rather
   * than assigning `Title: metadata?.title` directly.
   */
  private buildInfo(metadata?: DocumentMetadata): PDFKit.DocumentInfo {
    const info: PDFKit.DocumentInfo = {};
    if (metadata?.title) {
      info.Title = metadata.title;
    }
    if (metadata?.author) {
      info.Author = metadata.author;
    }
    if (metadata?.subject) {
      info.Subject = metadata.subject;
    }
    if (metadata?.keywords && metadata.keywords.length > 0) {
      info.Keywords = metadata.keywords.join(', ');
    }
    return info;
  }

  private writeContent(
    doc: PDFKit.PDFDocument,
    content: DocumentContent,
  ): void {
    if (content.title) {
      doc.fontSize(20).text(content.title, { align: 'center' });
      doc.moveDown(1.5);
    }
    for (const section of content.sections) {
      if (section.heading) {
        doc.fontSize(14).text(section.heading);
        doc.moveDown(0.5);
      }
      doc.fontSize(11);
      for (const paragraph of section.paragraphs ?? []) {
        doc.text(paragraph, { align: 'left' });
        doc.moveDown(0.25);
      }
      if (section.table) {
        this.writeTable(doc, section.table);
      }
      doc.moveDown(1);
    }
  }

  private writeTable(doc: PDFKit.PDFDocument, table: DocumentTableModel): void {
    const usableWidth = doc.page.width - PAGE_MARGIN * 2;
    const columnCount = Math.max(table.headers.length, 1);
    const columnWidth = usableWidth / columnCount;
    const startX = doc.x;

    doc.fontSize(10);
    this.writeTableRow(doc, table.headers, startX, columnWidth, true);
    for (const row of table.rows) {
      this.writeTableRow(doc, row, startX, columnWidth, false);
    }
  }

  private writeTableRow(
    doc: PDFKit.PDFDocument,
    cells: readonly string[],
    startX: number,
    columnWidth: number,
    isHeader: boolean,
  ): void {
    const rowY = doc.y;
    cells.forEach((cell, columnIndex) => {
      doc.text(cell, startX + columnIndex * columnWidth, rowY, {
        width: columnWidth,
      });
    });
    doc.y = rowY + (isHeader ? 16 : 14);
  }

  private async decoratePages(
    doc: PDFKit.PDFDocument,
    options: PdfGenerateOptions,
  ): Promise<void> {
    const range = doc.bufferedPageRange();
    const qrImage = options.qrCode
      ? await this.renderQrCode(options.qrCode)
      : undefined;

    for (let offset = 0; offset < range.count; offset += 1) {
      const pageIndex = range.start + offset;
      doc.switchToPage(pageIndex);
      const context: PageContext = {
        pageIndex: offset,
        pageCount: range.count,
        width: doc.page.width,
        height: doc.page.height,
      };
      options.header?.(doc, context);
      options.footer?.(doc, context);
      if (options.pageNumbering) {
        this.drawPageNumber(doc, context);
      }
      options.watermark?.(doc, context);
      if (qrImage && offset === 0) {
        this.drawQrCode(doc, qrImage, options.qrCode as QrCodeOptions);
      }
    }
  }

  private drawPageNumber(doc: PDFKit.PDFDocument, context: PageContext): void {
    const label = `Page ${context.pageIndex + 1} of ${context.pageCount}`;
    doc
      .fontSize(9)
      .fillColor('#666666')
      .text(label, 0, context.height - 30, {
        width: context.width,
        align: 'center',
      })
      .fillColor('black');
  }

  private async renderQrCode(
    qrCode: QrCodeOptions,
  ): Promise<Buffer | undefined> {
    const qrCodeModule = tryLoadDriver<QrCodeModule>('qrcode', this.resolver);
    if (!qrCodeModule) {
      return undefined;
    }
    return qrCodeModule.toBuffer(qrCode.data, {
      type: 'png',
      width: qrCode.size ?? 96,
      margin: 1,
    });
  }

  private drawQrCode(
    doc: PDFKit.PDFDocument,
    image: Buffer,
    qrCode: QrCodeOptions,
  ): void {
    const size = qrCode.size ?? 96;
    doc.image(
      image,
      qrCode.x ?? doc.page.width - size - PAGE_MARGIN,
      qrCode.y ?? PAGE_MARGIN,
      {
        width: size,
        height: size,
      },
    );
  }
}
