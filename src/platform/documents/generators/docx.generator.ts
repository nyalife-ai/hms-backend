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

export interface DocxGenerateOptions {
  readonly content: DocumentContent;
  readonly metadata?: DocumentMetadata;
  readonly templateEngine?: TemplateEngine;
  readonly templateContext?: Readonly<Record<string, unknown>>;
}

/**
 * Store-only (uncompressed) ZIP writer — an OOXML package is a ZIP archive,
 * and DOCX/XLSX readers accept the store method, so no compression codec is
 * required. Keeping this dependency-free avoids pulling in a heavy zip
 * library just to scaffold a minimal `.docx`.
 */
export class MinimalZipWriter {
  private readonly entries: { readonly name: string; readonly data: Buffer }[] =
    [];

  public addFile(name: string, content: string | Buffer): this {
    const data = Buffer.isBuffer(content)
      ? content
      : Buffer.from(content, 'utf8');
    this.entries.push({ name, data });
    return this;
  }

  public toBuffer(): Buffer {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;

    for (const entry of this.entries) {
      const nameBuffer = Buffer.from(entry.name, 'utf8');
      const crc = crc32(entry.data);
      const size = entry.data.length;

      const localHeader = Buffer.alloc(30);
      localHeader.writeUInt32LE(0x04034b50, 0);
      localHeader.writeUInt16LE(20, 4);
      localHeader.writeUInt16LE(0, 6);
      localHeader.writeUInt16LE(0, 8);
      localHeader.writeUInt16LE(0, 10);
      localHeader.writeUInt16LE(0x21, 12);
      localHeader.writeUInt32LE(crc, 14);
      localHeader.writeUInt32LE(size, 18);
      localHeader.writeUInt32LE(size, 22);
      localHeader.writeUInt16LE(nameBuffer.length, 26);
      localHeader.writeUInt16LE(0, 28);
      localParts.push(localHeader, nameBuffer, entry.data);

      const centralHeader = Buffer.alloc(46);
      centralHeader.writeUInt32LE(0x02014b50, 0);
      centralHeader.writeUInt16LE(20, 4);
      centralHeader.writeUInt16LE(20, 6);
      centralHeader.writeUInt16LE(0, 8);
      centralHeader.writeUInt16LE(0, 10);
      centralHeader.writeUInt16LE(0, 12);
      centralHeader.writeUInt16LE(0x21, 14);
      centralHeader.writeUInt32LE(crc, 16);
      centralHeader.writeUInt32LE(size, 20);
      centralHeader.writeUInt32LE(size, 24);
      centralHeader.writeUInt16LE(nameBuffer.length, 28);
      centralHeader.writeUInt16LE(0, 30);
      centralHeader.writeUInt16LE(0, 32);
      centralHeader.writeUInt16LE(0, 34);
      centralHeader.writeUInt16LE(0, 36);
      centralHeader.writeUInt32LE(0, 38);
      centralHeader.writeUInt32LE(offset, 42);
      centralParts.push(centralHeader, nameBuffer);

      offset += localHeader.length + nameBuffer.length + entry.data.length;
    }

    const centralDirectoryOffset = offset;
    const centralDirectory = Buffer.concat(centralParts);

    const endRecord = Buffer.alloc(22);
    endRecord.writeUInt32LE(0x06054b50, 0);
    endRecord.writeUInt16LE(0, 4);
    endRecord.writeUInt16LE(0, 6);
    endRecord.writeUInt16LE(this.entries.length, 8);
    endRecord.writeUInt16LE(this.entries.length, 10);
    endRecord.writeUInt32LE(centralDirectory.length, 12);
    endRecord.writeUInt32LE(centralDirectoryOffset, 16);
    endRecord.writeUInt16LE(0, 20);

    return Buffer.concat([...localParts, centralDirectory, endRecord]);
  }
}

function crc32(buffer: Buffer): number {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return ~crc >>> 0;
}

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const PACKAGE_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const WORDPROCESSINGML_NAMESPACE =
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export class DocxGenerator implements DocumentGenerator<DocxGenerateOptions> {
  public readonly format = 'docx';

  public generate(options: DocxGenerateOptions): Promise<Buffer> {
    const content = applyTemplate(
      options.content,
      options.templateEngine,
      options.templateContext,
    );
    const documentXml = this.buildDocumentXml(content);
    const zip = new MinimalZipWriter()
      .addFile('[Content_Types].xml', CONTENT_TYPES_XML)
      .addFile('_rels/.rels', PACKAGE_RELS_XML)
      .addFile('word/document.xml', documentXml);
    return Promise.resolve(zip.toBuffer());
  }

  private buildDocumentXml(content: DocumentContent): string {
    const body: string[] = [];
    if (content.title) {
      body.push(paragraph(content.title, { bold: true, size: 32 }));
    }
    for (const section of content.sections) {
      body.push(...this.buildSectionXml(section));
    }
    body.push('<w:sectPr/>');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${WORDPROCESSINGML_NAMESPACE}">
  <w:body>
    ${body.join('\n    ')}
  </w:body>
</w:document>`;
  }

  private buildSectionXml(section: DocumentSection): string[] {
    const parts: string[] = [];
    if (section.heading) {
      parts.push(paragraph(section.heading, { bold: true, size: 26 }));
    }
    for (const text of section.paragraphs ?? []) {
      parts.push(paragraph(text));
    }
    if (section.table) {
      parts.push(this.buildTableXml(section.table));
    }
    return parts;
  }

  private buildTableXml(table: DocumentTableModel): string {
    const headerRow = tableRow(table.headers, true);
    const bodyRows = table.rows.map((row) => tableRow(row, false));
    return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>${headerRow}${bodyRows.join('')}</w:tbl>`;
  }
}

function paragraph(
  text: string,
  options: { readonly bold?: boolean; readonly size?: number } = {},
): string {
  const runProperties: string[] = [];
  if (options.bold) {
    runProperties.push('<w:b/>');
  }
  if (options.size) {
    runProperties.push(`<w:sz w:val="${options.size}"/>`);
  }
  const runPropertiesXml =
    runProperties.length > 0 ? `<w:rPr>${runProperties.join('')}</w:rPr>` : '';
  return `<w:p><w:r>${runPropertiesXml}<w:t xml:space="preserve">${escapeMarkup(text)}</w:t></w:r></w:p>`;
}

function tableCell(text: string, isHeader: boolean): string {
  return `<w:tc><w:tcPr/>${paragraph(text, { bold: isHeader })}</w:tc>`;
}

function tableRow(cells: readonly string[], isHeader: boolean): string {
  return `<w:tr>${cells.map((cell) => tableCell(cell, isHeader)).join('')}</w:tr>`;
}
