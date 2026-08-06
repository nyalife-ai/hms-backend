import 'reflect-metadata';
import PDFDocument from 'pdfkit';
import { Test } from '@nestjs/testing';
import { BusinessRuleException } from '../../../core/exceptions/business-rule.exception';
import { UnsupportedDocumentFormatException } from '../documents.exceptions';
import {
  MissingDriverError,
  loadDriver,
  tryLoadDriver,
  type ModuleResolver,
} from '../optional-driver';
import {
  escapeMarkup,
  isTemplateTruthy,
  resolveTemplatePath,
  stringifyValue,
} from '../markup-escape.util';
import {
  DOCX_GENERATOR,
  HTML_GENERATOR,
  PDF_GENERATOR,
  type DocumentContent,
} from '../interfaces/document-generator.interface';
import {
  SPREADSHEET_PARSER,
  SPREADSHEET_WRITER,
  type SpreadsheetWorkbook,
} from '../interfaces/spreadsheet-parser.interface';
import {
  TEMPLATE_ENGINE,
  type TemplateEngine,
} from '../interfaces/template-engine.interface';
import { applyTemplate } from '../generators/document-content.util';
import { PdfGenerator } from '../generators/pdf.generator';
import { DocxGenerator, MinimalZipWriter } from '../generators/docx.generator';
import { HtmlGenerator } from '../generators/html.generator';
import { CsvParser } from '../spreadsheets/csv.parser';
import { XlsxParser, type ExceljsModule } from '../spreadsheets/xlsx.parser';
import {
  JsonSpreadsheetWriter,
  XlsxWriter,
  type ExceljsWriterModule,
} from '../spreadsheets/xlsx.writer';
import { XlsParser } from '../spreadsheets/xls.parser';
import { OdsParser } from '../spreadsheets/ods.parser';
import { HandlebarsTemplateEngine } from '../templates/handlebars.engine';
import { MarkdownTemplateEngine } from '../templates/markdown.engine';
import { DocumentService } from '../document.service';
import { DocumentsModule } from '../documents.module';

const throwingResolver: ModuleResolver = () => {
  throw new Error('driver not installed');
};

describe('documents platform / optional-driver', () => {
  it('loadDriver resolves a package and throws MissingDriverError with cause when absent', () => {
    expect(loadDriver('node:path')).toBeDefined();
    expect(() =>
      loadDriver('does-not-exist-package', throwingResolver),
    ).toThrow(MissingDriverError);
    try {
      loadDriver('does-not-exist-package', throwingResolver);
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(MissingDriverError);
      expect((error as MissingDriverError).packageName).toBe(
        'does-not-exist-package',
      );
      expect((error as MissingDriverError).message).toContain(
        'yarn add does-not-exist-package',
      );
      expect((error as MissingDriverError).cause).toBeInstanceOf(Error);
    }
    expect(new MissingDriverError('pkg').cause).toBeUndefined();
  });

  it('tryLoadDriver returns the module when present and undefined when absent', () => {
    expect(tryLoadDriver('node:path')).toBeDefined();
    expect(
      tryLoadDriver('does-not-exist-package', throwingResolver),
    ).toBeUndefined();
  });
});

describe('documents platform / documents.exceptions', () => {
  it('carries the format in metadata and extends BusinessRuleException', () => {
    const error = new UnsupportedDocumentFormatException(
      'xls',
      'not supported',
    );
    expect(error).toBeInstanceOf(BusinessRuleException);
    expect(error.code).toBe('UNSUPPORTED_DOCUMENT_FORMAT');
    expect(error.metadata.format).toBe('xls');
    expect(error.message).toBe('not supported');
  });
});

describe('documents platform / markup-escape.util', () => {
  it('escapes markup-sensitive characters', () => {
    expect(escapeMarkup(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&apos;');
    expect(escapeMarkup('plain')).toBe('plain');
  });

  it('stringifies null, undefined, Date and other values', () => {
    expect(stringifyValue(null)).toBe('');
    expect(stringifyValue(undefined)).toBe('');
    expect(stringifyValue(new Date('2026-01-01T00:00:00.000Z'))).toBe(
      '2026-01-01T00:00:00.000Z',
    );
    expect(stringifyValue('already a string')).toBe('already a string');
    expect(stringifyValue(42)).toBe('42');
    expect(stringifyValue(true)).toBe('true');
    expect(stringifyValue({ toString: () => 'custom object' })).toBe(
      'custom object',
    );
  });

  it('resolves dotted paths, this/., and missing intermediates', () => {
    const context = { a: { b: { c: 'deep' } }, n: 5 };
    expect(resolveTemplatePath(context, 'this')).toBe(context);
    expect(resolveTemplatePath(context, '.')).toBe(context);
    expect(resolveTemplatePath(context, 'a.b.c')).toBe('deep');
    expect(resolveTemplatePath(context, 'a.missing.c')).toBeUndefined();
    expect(resolveTemplatePath(context, 'n.c')).toBeUndefined();
    expect(resolveTemplatePath(null, 'a')).toBeUndefined();
  });

  it('computes mustache-style truthiness', () => {
    expect(isTemplateTruthy([1, 2])).toBe(true);
    expect(isTemplateTruthy([])).toBe(false);
    expect(isTemplateTruthy('x')).toBe(true);
    expect(isTemplateTruthy(0)).toBe(false);
    expect(isTemplateTruthy(undefined)).toBe(false);
  });
});

describe('documents platform / applyTemplate', () => {
  const engine: TemplateEngine = {
    name: 'fake',
    render: (template, context) =>
      template.replace('{{x}}', stringifyValue(context?.x)),
  };

  it('returns content unchanged when no engine is supplied', () => {
    const content: DocumentContent = { title: '{{x}}', sections: [] };
    expect(applyTemplate(content)).toBe(content);
  });

  it('renders every text field when an engine is supplied', () => {
    const content: DocumentContent = {
      title: 'Title {{x}}',
      sections: [
        {
          heading: 'Heading {{x}}',
          paragraphs: ['P {{x}}'],
          table: { headers: ['H {{x}}'], rows: [['R {{x}}']] },
        },
        {},
      ],
    };
    const rendered = applyTemplate(content, engine, { x: 'Y' });
    expect(rendered.title).toBe('Title Y');
    expect(rendered.sections[0]).toEqual({
      heading: 'Heading Y',
      paragraphs: ['P Y'],
      table: { headers: ['H Y'], rows: [['R Y']] },
    });
    expect(rendered.sections[1]).toEqual({
      heading: undefined,
      paragraphs: undefined,
      table: undefined,
    });
  });

  it('handles content with no title', () => {
    const content: DocumentContent = { sections: [] };
    expect(applyTemplate(content, engine).title).toBeUndefined();
  });
});

describe('documents platform / PdfGenerator', () => {
  it('generates a fully-featured multi-page PDF with hooks, metadata, template rendering, QR code and security post-processing', async () => {
    const generator = new PdfGenerator();
    const header = jest.fn();
    const footer = jest.fn();
    const watermark = jest.fn();
    const paragraphs = Array.from(
      { length: 120 },
      (_unused, index) =>
        `Paragraph number ${index} contains enough filler text to consume vertical space on the page and force pagination.`,
    );
    const content: DocumentContent = {
      title: 'Report {{year}}',
      sections: [
        {
          heading: 'Summary',
          paragraphs,
          table: {
            headers: ['Col A', 'Col B'],
            rows: [
              ['1', '2'],
              ['3', '4'],
            ],
          },
        },
      ],
    };
    const templateEngine: TemplateEngine = {
      name: 'fake',
      render: (template, context) =>
        template.replace('{{year}}', stringifyValue(context?.year)),
    };
    const imageSpy = jest.spyOn(PDFDocument.prototype, 'image');
    const buffer = await generator.generate({
      content,
      metadata: {
        title: 'meta title',
        author: 'Author',
        subject: 'Subject',
        keywords: ['a', 'b'],
      },
      pageNumbering: true,
      header,
      footer,
      watermark,
      qrCode: { data: 'https://example.test' },
      templateEngine,
      templateContext: { year: 2026 },
      sign: (value) => Buffer.concat([Buffer.from('SIGNED:'), value]),
      encrypt: (value) =>
        Promise.resolve(Buffer.concat([Buffer.from('ENC:'), value])),
    });

    expect(buffer.subarray(0, 11).toString('latin1')).toBe('ENC:SIGNED:');
    expect(buffer.subarray(11, 15).toString('latin1')).toBe('%PDF');
    expect(header.mock.calls.length).toBeGreaterThan(1);
    expect(footer.mock.calls.length).toBe(header.mock.calls.length);
    expect(watermark.mock.calls.length).toBe(header.mock.calls.length);
    const [, firstContext] = header.mock.calls[0] as [
      unknown,
      { pageIndex: number; pageCount: number },
    ];
    expect(firstContext.pageIndex).toBe(0);
    expect(firstContext.pageCount).toBe(header.mock.calls.length);
    expect(imageSpy).toHaveBeenCalledTimes(1);
    imageSpy.mockRestore();
  });

  it('generates a minimal PDF without metadata, hooks, page numbering, QR code or template engine', async () => {
    const generator = new PdfGenerator();
    const buffer = await generator.generate({
      content: { sections: [{}] },
    });
    expect(buffer.subarray(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('skips the QR code embed when the optional qrcode driver is unavailable', async () => {
    const generator = new PdfGenerator(throwingResolver);
    const imageSpy = jest.spyOn(PDFDocument.prototype, 'image');
    const buffer = await generator.generate({
      content: { sections: [{ paragraphs: ['hello'] }] },
      qrCode: { data: 'x' },
    });
    expect(imageSpy).not.toHaveBeenCalled();
    imageSpy.mockRestore();
    expect(buffer.subarray(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('omits info keys that are absent, even when metadata is partially provided (no undefined values reach pdfkit)', async () => {
    const generator = new PdfGenerator();
    const buffer = await generator.generate({
      content: { sections: [{ paragraphs: ['hi'] }] },
      metadata: { keywords: [] },
    });
    expect(buffer.subarray(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('exposes its format discriminator', () => {
    expect(new PdfGenerator().format).toBe('pdf');
  });
});

describe('documents platform / MinimalZipWriter', () => {
  it('produces a store-only zip with a valid end-of-central-directory record', () => {
    const zip = new MinimalZipWriter()
      .addFile('a.txt', 'hello')
      .addFile('b.bin', Buffer.from([1, 2, 3]));
    const buffer = zip.toBuffer();
    expect(buffer.subarray(0, 4)).toEqual(
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    );
    const end = buffer.subarray(buffer.length - 22);
    expect(end.readUInt32LE(0)).toBe(0x06054b50);
    expect(end.readUInt16LE(8)).toBe(2);
    expect(buffer.toString('latin1')).toContain('hello');
  });
});

describe('documents platform / DocxGenerator', () => {
  it('generates a valid docx package for full content, escaping special characters', async () => {
    const generator = new DocxGenerator();
    const templateEngine: TemplateEngine = {
      name: 'fake',
      render: (template, context) =>
        template.replace('{{name}}', stringifyValue(context?.name)),
    };
    const content: DocumentContent = {
      title: 'R&D <Report> {{name}}',
      sections: [
        {
          heading: 'Section One',
          paragraphs: ['Paragraph text'],
          table: { headers: ['H1', 'H2'], rows: [['R1', 'R2']] },
        },
      ],
    };
    const buffer = await generator.generate({
      content,
      templateEngine,
      templateContext: { name: 'Acme' },
    });
    expect(buffer.subarray(0, 4)).toEqual(
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    );
    const text = buffer.toString('latin1');
    expect(text).toContain('R&amp;D &lt;Report&gt; Acme');
    expect(text).toContain('word/document.xml');
    expect(text).toContain('[Content_Types].xml');
    expect(generator.format).toBe('docx');
  });

  it('generates a minimal docx package with no title/sections content', async () => {
    const generator = new DocxGenerator();
    const buffer = await generator.generate({ content: { sections: [{}] } });
    expect(buffer.subarray(0, 4)).toEqual(
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    );
  });
});

describe('documents platform / HtmlGenerator', () => {
  it('renders full content with metadata, custom stylesheet and template engine', async () => {
    const generator = new HtmlGenerator();
    const templateEngine: TemplateEngine = {
      name: 'fake',
      render: (template, context) =>
        template.replace('{{name}}', stringifyValue(context?.name)),
    };
    const content: DocumentContent = {
      title: 'Hello {{name}}',
      sections: [
        {
          heading: 'Section <1>',
          paragraphs: ['Body & text'],
          table: { headers: ['H1'], rows: [['R1']] },
        },
      ],
    };
    const buffer = await generator.generate({
      content,
      stylesheet: 'body{color:red;}',
      templateEngine,
      templateContext: { name: 'World' },
    });
    const html = buffer.toString('utf8');
    expect(html).toContain('<title>Hello World</title>');
    expect(html).toContain('Section &lt;1&gt;');
    expect(html).toContain('Body &amp; text');
    expect(html).toContain('body{color:red;}');
    expect(html).toContain('<table>');
    expect(generator.format).toBe('html');
  });

  it('falls back to metadata title, then to "Document", and default stylesheet', async () => {
    const generator = new HtmlGenerator();
    const withMetadataTitle = await generator.generate({
      content: { sections: [{}] },
      metadata: { title: 'Meta Title' },
    });
    expect(withMetadataTitle.toString('utf8')).toContain(
      '<title>Meta Title</title>',
    );

    const withNoTitleAtAll = await generator.generate({
      content: { sections: [{}] },
    });
    const html = withNoTitleAtAll.toString('utf8');
    expect(html).toContain('<title>Document</title>');
    expect(html).toContain('font-family:Arial');
  });
});

describe('documents platform / CsvParser', () => {
  const parser = new CsvParser();

  it('parses quoted fields, embedded commas/newlines, escaped quotes, and CRLF endings', async () => {
    const csv = '"Doe, John","Line1\nLine2","She said ""hi"""\r\nBob,25\r\n';
    const workbook = await parser.parse(csv);
    expect(workbook.sheets[0].rows).toEqual([
      ['Doe, John', 'Line1\nLine2', 'She said "hi"'],
      ['Bob', '25'],
    ]);
  });

  it('parses a Buffer, an empty string, and text with no trailing newline', async () => {
    const fromBuffer = await parser.parse(Buffer.from('a,b\nc,d'));
    expect(fromBuffer.sheets[0].rows).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    const empty = await parser.parse('');
    expect(empty.sheets[0].rows).toEqual([]);
  });

  it('supports a custom delimiter and sheet name', async () => {
    const semicolon = new CsvParser({ delimiter: ';', sheetName: 'Data' });
    const workbook = await semicolon.parse('a;b\n1;2');
    expect(workbook.sheets[0].name).toBe('Data');
    expect(workbook.sheets[0].rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('writes rows back to CSV, quoting only when necessary', async () => {
    const workbook: SpreadsheetWorkbook = {
      sheets: [
        {
          name: 'Sheet1',
          rows: [
            ['plain', 'has,comma', 'has"quote', 'has\nnewline'],
            [42, true, null, new Date('2026-01-01T00:00:00.000Z')],
          ],
        },
      ],
    };
    const buffer = await parser.write(workbook);
    expect(buffer.toString('utf8')).toBe(
      'plain,"has,comma","has""quote","has\nnewline"\r\n' +
        '42,true,,2026-01-01T00:00:00.000Z',
    );
  });

  it('writes an empty buffer when the workbook has no sheets', async () => {
    const buffer = await parser.write({ sheets: [] });
    expect(buffer.length).toBe(0);
  });
});

describe('documents platform / XlsxParser', () => {
  it('maps worksheets and rows into the generic workbook model', async () => {
    class FakeWorksheet {
      public readonly name = 'Sheet1';
      public eachRow(
        callback: (
          row: { values: readonly unknown[] },
          rowNumber: number,
        ) => void,
      ): void {
        callback({ values: [undefined, 'Name', 'Age'] }, 1);
        callback({ values: [undefined, null, 30] }, 2);
        callback({ values: [undefined, undefined, true] }, 3);
        callback(
          {
            values: [
              undefined,
              new Date('2026-01-01T00:00:00.000Z'),
              { toString: () => 'custom' },
            ],
          },
          4,
        );
      }
    }
    class FakeWorkbook {
      public readonly worksheets = [new FakeWorksheet()];
      public readonly xlsx = { load: async (): Promise<void> => {} };
    }
    const fakeModule: ExceljsModule = { Workbook: FakeWorkbook };
    const parser = new XlsxParser((specifier) =>
      specifier === 'exceljs' ? fakeModule : throwingResolver(specifier),
    );
    const workbook = await parser.parse(Buffer.from('irrelevant'));
    expect(workbook.sheets).toHaveLength(1);
    expect(workbook.sheets[0].name).toBe('Sheet1');
    expect(workbook.sheets[0].rows).toEqual([
      ['Name', 'Age'],
      [null, 30],
      [null, true],
      [new Date('2026-01-01T00:00:00.000Z'), 'custom'],
    ]);
    expect(parser.format).toBe('xlsx');
  });

  it('accepts string input and throws MissingDriverError when exceljs is unavailable', async () => {
    const parser = new XlsxParser(throwingResolver);
    await expect(parser.parse('irrelevant')).rejects.toBeInstanceOf(
      MissingDriverError,
    );
  });
});

describe('documents platform / XlsxWriter and JsonSpreadsheetWriter', () => {
  it('writes worksheets via the exceljs driver', async () => {
    const addRow = jest.fn();
    const addWorksheet = jest.fn().mockReturnValue({ addRow });
    class FakeWorkbook {
      public readonly addWorksheet = addWorksheet;
      public readonly xlsx = {
        writeBuffer: async (): Promise<Buffer> => Buffer.from('xlsx-bytes'),
      };
    }
    const fakeModule: ExceljsWriterModule = { Workbook: FakeWorkbook };
    const writer = new XlsxWriter((specifier) =>
      specifier === 'exceljs' ? fakeModule : throwingResolver(specifier),
    );
    const workbook: SpreadsheetWorkbook = {
      sheets: [{ name: 'Sheet1', rows: [['a', 1]] }],
    };
    const buffer = await writer.write(workbook);
    expect(buffer.toString('utf8')).toBe('xlsx-bytes');
    expect(addWorksheet).toHaveBeenCalledWith('Sheet1');
    expect(addRow).toHaveBeenCalledWith(['a', 1]);
    expect(writer.format).toBe('xlsx');
  });

  it('throws MissingDriverError when exceljs is unavailable', async () => {
    const writer = new XlsxWriter(throwingResolver);
    await expect(writer.write({ sheets: [] })).rejects.toBeInstanceOf(
      MissingDriverError,
    );
  });

  it('serializes workbooks as JSON without needing exceljs, converting Dates to ISO strings', async () => {
    const writer = new JsonSpreadsheetWriter();
    const workbook: SpreadsheetWorkbook = {
      sheets: [
        {
          name: 'Sheet1',
          rows: [['plain', 5, new Date('2026-01-01T00:00:00.000Z')]],
        },
      ],
    };
    const buffer = await writer.write(workbook);
    expect(JSON.parse(buffer.toString('utf8'))).toEqual({
      sheets: [
        {
          name: 'Sheet1',
          rows: [['plain', 5, '2026-01-01T00:00:00.000Z']],
        },
      ],
    });
    expect(writer.format).toBe('json');
  });
});

describe('documents platform / XlsParser and OdsParser', () => {
  it('rejects XLS input with a clear unsupported-format error', async () => {
    const parser = new XlsParser();
    await expect(parser.parse(Buffer.from('x'))).rejects.toBeInstanceOf(
      UnsupportedDocumentFormatException,
    );
    expect(parser.format).toBe('xls');
  });

  it('rejects ODS input with a clear unsupported-format error', async () => {
    const parser = new OdsParser();
    await expect(parser.parse('x')).rejects.toBeInstanceOf(
      UnsupportedDocumentFormatException,
    );
    expect(parser.format).toBe('ods');
  });
});

describe('documents platform / HandlebarsTemplateEngine', () => {
  it('renders escaped and raw variables, each/if blocks, nesting and dotted paths without the handlebars driver', () => {
    const engine = new HandlebarsTemplateEngine(throwingResolver);
    expect(engine.render('Hi {{name}}!', { name: '<b>' })).toBe(
      'Hi &lt;b&gt;!',
    );
    expect(engine.render('Raw: {{{html}}}', { html: '<b>x</b>' })).toBe(
      'Raw: <b>x</b>',
    );
    expect(
      engine.render('{{#each items}}[{{this}}]{{/each}}', { items: [1, 2, 3] }),
    ).toBe('[1][2][3]');
    expect(
      engine.render('{{#each items}}[{{this}}]{{/each}}', { items: 'nope' }),
    ).toBe('');
    expect(
      engine.render('{{#if flag}}YES{{else}}NO{{/if}}', { flag: true }),
    ).toBe('YES');
    expect(
      engine.render('{{#if flag}}YES{{else}}NO{{/if}}', { flag: false }),
    ).toBe('NO');
    expect(engine.render('{{#if flag}}YES{{/if}}', { flag: false })).toBe('');
    expect(engine.render('no tags here')).toBe('no tags here');
    expect(engine.render('broken {{unclosed')).toBe('broken {{unclosed');
    expect(engine.render('broken {{{unclosed')).toBe('broken {{{unclosed');
    expect(
      engine.render('{{#each rows}}{{#if this}}Y{{else}}N{{/if}}{{/each}}', {
        rows: [true, false],
      }),
    ).toBe('YN');
    expect(engine.render('{{a.b.c}}', { a: { b: { c: 'deep' } } })).toBe(
      'deep',
    );
    expect(engine.name).toBe('handlebars');
  });

  it('delegates to the real handlebars driver when available', () => {
    const fakeHandlebars = {
      compile: (template: string) => (context: unknown) =>
        template.replace(
          '{{name}}',
          String((context as { name?: unknown })?.name),
        ),
    };
    const engine = new HandlebarsTemplateEngine((specifier) =>
      specifier === 'handlebars' ? fakeHandlebars : throwingResolver(specifier),
    );
    expect(engine.render('Hi {{name}}', { name: 'Bob' })).toBe('Hi Bob');
  });
});

describe('documents platform / MarkdownTemplateEngine', () => {
  it('converts headings, lists, paragraphs and inline emphasis/code/links, substituting variables first', () => {
    const engine = new MarkdownTemplateEngine(throwingResolver);
    const markdown = [
      '# Heading {{name}}',
      'Some **bold** and *italic* and _emph_ and `code` and [link](http://x).',
      '',
      '- item one',
      '- item two',
      '',
      '## Heading Two',
      'Another paragraph.',
    ].join('\n');
    const html = engine.render(markdown, { name: 'World' });
    expect(html).toContain('<h1>Heading World</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<em>emph</em>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<a href="http://x">link</a>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>item one</li>');
    expect(html).toContain('<li>item two</li>');
    expect(html).toContain('<h2>Heading Two</h2>');
    expect(html).toContain('<p>Another paragraph.</p>');
    expect(engine.name).toBe('markdown');
  });

  it('renders plain text with no special syntax as a single paragraph', () => {
    const engine = new MarkdownTemplateEngine(throwingResolver);
    expect(engine.render('just text')).toBe('<p>just text</p>');
  });

  it('delegates to the real marked driver when available', () => {
    const fakeMarked = {
      parse: (markdown: string) => `<div>${markdown}</div>`,
    };
    const engine = new MarkdownTemplateEngine((specifier) =>
      specifier === 'marked' ? fakeMarked : throwingResolver(specifier),
    );
    expect(engine.render('# Hi')).toBe('<div># Hi</div>');
  });
});

describe('documents platform / DocumentService', () => {
  it('delegates to injected dependencies', async () => {
    const pdfGenerator = {
      format: 'pdf',
      generate: jest.fn().mockResolvedValue(Buffer.from('pdf')),
    };
    const docxGenerator = {
      format: 'docx',
      generate: jest.fn().mockResolvedValue(Buffer.from('docx')),
    };
    const htmlGenerator = {
      format: 'html',
      generate: jest.fn().mockResolvedValue(Buffer.from('html')),
    };
    const csvParser = {
      format: 'csv',
      parse: jest.fn().mockResolvedValue({ sheets: [] }),
      write: jest.fn().mockResolvedValue(Buffer.from('csv')),
    };
    const xlsxParser = {
      format: 'xlsx',
      parse: jest.fn().mockResolvedValue({ sheets: [] }),
    };
    const xlsxWriter = {
      format: 'xlsx',
      write: jest.fn().mockResolvedValue(Buffer.from('xlsx')),
    };
    const jsonSpreadsheetWriter = {
      format: 'json',
      write: jest.fn().mockResolvedValue(Buffer.from('json')),
    };
    const xlsParser = {
      format: 'xls',
      parse: jest.fn().mockRejectedValue(new Error('unused')),
    };
    const odsParser = {
      format: 'ods',
      parse: jest.fn().mockRejectedValue(new Error('unused')),
    };
    const handlebarsEngine = {
      name: 'handlebars',
      render: jest.fn().mockReturnValue('hbs-out'),
    };
    const markdownEngine = {
      name: 'markdown',
      render: jest.fn().mockReturnValue('md-out'),
    };

    const service = new DocumentService({
      pdfGenerator,
      docxGenerator,
      htmlGenerator,
      csvParser,
      xlsxParser,
      xlsxWriter,
      jsonSpreadsheetWriter,
      xlsParser,
      odsParser,
      handlebarsEngine,
      markdownEngine,
    });

    await service.generatePdf({ content: { sections: [] } });
    expect(pdfGenerator.generate).toHaveBeenCalledTimes(1);
    await service.generateDocx({ content: { sections: [] } });
    expect(docxGenerator.generate).toHaveBeenCalledTimes(1);
    await service.generateHtml({ content: { sections: [] } });
    expect(htmlGenerator.generate).toHaveBeenCalledTimes(1);

    await service.parseSpreadsheet('csv', 'a,b');
    expect(csvParser.parse).toHaveBeenCalledWith('a,b');
    await service.parseSpreadsheet('xlsx', Buffer.from('x'));
    expect(xlsxParser.parse).toHaveBeenCalledTimes(1);
    await service
      .parseSpreadsheet('xls', Buffer.from('x'))
      .catch(() => undefined);
    expect(xlsParser.parse).toHaveBeenCalledTimes(1);
    await service
      .parseSpreadsheet('ods', Buffer.from('x'))
      .catch(() => undefined);
    expect(odsParser.parse).toHaveBeenCalledTimes(1);

    const workbook: SpreadsheetWorkbook = { sheets: [] };
    await service.exportSpreadsheet(workbook, 'csv');
    expect(csvParser.write).toHaveBeenCalledWith(workbook);
    await service.exportSpreadsheet(workbook, 'xlsx');
    expect(xlsxWriter.write).toHaveBeenCalledWith(workbook);
    await service.exportSpreadsheet(workbook, 'json');
    expect(jsonSpreadsheetWriter.write).toHaveBeenCalledWith(workbook);

    expect(service.renderTemplate('handlebars', 'tpl')).toBe('hbs-out');
    expect(service.renderTemplate('markdown', 'tpl')).toBe('md-out');
  });

  it('constructs working defaults when no dependencies are given', async () => {
    const service = new DocumentService();
    const pdf = await service.generatePdf({ content: { sections: [{}] } });
    expect(pdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
    const docx = await service.generateDocx({ content: { sections: [{}] } });
    expect(docx.subarray(0, 2).toString('latin1')).toBe('PK');
    const html = await service.generateHtml({ content: { sections: [{}] } });
    expect(html.toString('utf8')).toContain('<html');

    const csvWorkbook = await service.parseSpreadsheet('csv', 'a,b\n1,2');
    expect(csvWorkbook.sheets[0].rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    await expect(service.parseSpreadsheet('xls', 'x')).rejects.toBeInstanceOf(
      UnsupportedDocumentFormatException,
    );
    await expect(service.parseSpreadsheet('ods', 'x')).rejects.toBeInstanceOf(
      UnsupportedDocumentFormatException,
    );
    expect(() => service.parseSpreadsheet('bogus' as never, 'x')).toThrow(
      UnsupportedDocumentFormatException,
    );

    const jsonExport = await service.exportSpreadsheet(csvWorkbook, 'json');
    expect(JSON.parse(jsonExport.toString('utf8'))).toEqual(csvWorkbook);
    const csvExport = await service.exportSpreadsheet(csvWorkbook, 'csv');
    expect(csvExport.toString('utf8')).toBe('a,b\r\n1,2');
    expect(() =>
      service.exportSpreadsheet(csvWorkbook, 'bogus' as never),
    ).toThrow(UnsupportedDocumentFormatException);

    expect(service.renderTemplate('handlebars', 'Hi {{x}}', { x: 'Y' })).toBe(
      'Hi Y',
    );
    expect(service.renderTemplate('markdown', 'text')).toBe('<p>text</p>');
    expect(() => service.renderTemplate('bogus' as never, 'text')).toThrow(
      UnsupportedDocumentFormatException,
    );
  });

  it('uses a custom resolver end-to-end for xlsx import/export', async () => {
    class FakeWorksheet {
      public readonly name = 'Sheet1';
      public eachRow(
        callback: (
          row: { values: readonly unknown[] },
          rowNumber: number,
        ) => void,
      ): void {
        callback({ values: [undefined, 'a', 'b'] }, 1);
      }
    }
    class FakeReadWorkbook {
      public readonly worksheets = [new FakeWorksheet()];
      public readonly xlsx = { load: async (): Promise<void> => {} };
    }
    const addRow = jest.fn();
    class FakeWriteWorkbook {
      public addWorksheet(): { addRow: typeof addRow } {
        return { addRow };
      }
      public readonly xlsx = {
        writeBuffer: async (): Promise<Buffer> => Buffer.from('xlsx-out'),
      };
    }
    const resolver: ModuleResolver = (specifier) => {
      if (specifier === 'exceljs') {
        return { Workbook: FakeReadWorkbook };
      }
      throw new Error('not installed');
    };
    const service = new DocumentService({ resolver });
    const workbook = await service.parseSpreadsheet('xlsx', Buffer.from('x'));
    expect(workbook.sheets[0].rows).toEqual([['a', 'b']]);

    const writeResolver: ModuleResolver = (specifier) => {
      if (specifier === 'exceljs') {
        return { Workbook: FakeWriteWorkbook };
      }
      throw new Error('not installed');
    };
    const writeService = new DocumentService({ resolver: writeResolver });
    const exported = await writeService.exportSpreadsheet(workbook, 'xlsx');
    expect(exported.toString('utf8')).toBe('xlsx-out');
  });
});

describe('documents platform / DocumentsModule', () => {
  it('registers default provider instances and exposes DocumentService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DocumentsModule.register()],
    }).compile();

    expect(moduleRef.get(PDF_GENERATOR)).toBeInstanceOf(PdfGenerator);
    expect(moduleRef.get(DOCX_GENERATOR)).toBeInstanceOf(DocxGenerator);
    expect(moduleRef.get(HTML_GENERATOR)).toBeInstanceOf(HtmlGenerator);
    expect(moduleRef.get(SPREADSHEET_PARSER)).toBeInstanceOf(CsvParser);
    expect(moduleRef.get(SPREADSHEET_WRITER)).toBeInstanceOf(XlsxWriter);
    expect(moduleRef.get(TEMPLATE_ENGINE)).toBeInstanceOf(
      HandlebarsTemplateEngine,
    );
    expect(moduleRef.get(DocumentService)).toBeInstanceOf(DocumentService);

    await moduleRef.close();
  });

  it('accepts a custom resolver option', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DocumentsModule.register({ resolver: throwingResolver })],
    }).compile();

    expect(moduleRef.get(DocumentService)).toBeInstanceOf(DocumentService);
    await moduleRef.close();
  });
});
