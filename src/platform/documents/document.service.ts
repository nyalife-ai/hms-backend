import { Injectable } from '@nestjs/common';
import type { DocumentGenerator } from './interfaces/document-generator.interface';
import type {
  SpreadsheetParser,
  SpreadsheetWorkbook,
  SpreadsheetWriter,
} from './interfaces/spreadsheet-parser.interface';
import type { TemplateEngine } from './interfaces/template-engine.interface';
import type { ModuleResolver } from './optional-driver';
import { UnsupportedDocumentFormatException } from './documents.exceptions';
import {
  DocxGenerator,
  type DocxGenerateOptions,
} from './generators/docx.generator';
import {
  HtmlGenerator,
  type HtmlGenerateOptions,
} from './generators/html.generator';
import {
  PdfGenerator,
  type PdfGenerateOptions,
} from './generators/pdf.generator';
import { CsvParser } from './spreadsheets/csv.parser';
import { OdsParser } from './spreadsheets/ods.parser';
import { XlsParser } from './spreadsheets/xls.parser';
import { XlsxParser } from './spreadsheets/xlsx.parser';
import { JsonSpreadsheetWriter, XlsxWriter } from './spreadsheets/xlsx.writer';
import { HandlebarsTemplateEngine } from './templates/handlebars.engine';
import { MarkdownTemplateEngine } from './templates/markdown.engine';

export type SpreadsheetImportFormat = 'csv' | 'xlsx' | 'xls' | 'ods';
export type SpreadsheetExportFormat = 'csv' | 'xlsx' | 'json';
export type TemplateEngineName = 'handlebars' | 'markdown';

/**
 * Dependencies are typed against the generic ports (not the concrete
 * classes) so callers can substitute any compatible implementation —
 * a durable/managed driver, or a test double — without needing to extend
 * the built-in generators/parsers/engines.
 */
export interface DocumentServiceDependencies {
  readonly pdfGenerator?: DocumentGenerator<PdfGenerateOptions>;
  readonly docxGenerator?: DocumentGenerator<DocxGenerateOptions>;
  readonly htmlGenerator?: DocumentGenerator<HtmlGenerateOptions>;
  readonly csvParser?: SpreadsheetParser & SpreadsheetWriter;
  readonly xlsxParser?: SpreadsheetParser;
  readonly xlsxWriter?: SpreadsheetWriter;
  readonly jsonSpreadsheetWriter?: SpreadsheetWriter;
  readonly xlsParser?: SpreadsheetParser;
  readonly odsParser?: SpreadsheetParser;
  readonly handlebarsEngine?: TemplateEngine;
  readonly markdownEngine?: TemplateEngine;
  readonly resolver?: ModuleResolver;
}

/**
 * Orchestrates the document platform slice: generate PDF/DOCX/HTML, parse
 * spreadsheet-like inputs, export workbooks, and render standalone
 * templates. A thin façade — all real work lives in the generators/parsers/
 * engines, which remain independently usable and testable.
 */
@Injectable()
export class DocumentService {
  private readonly pdfGenerator: DocumentGenerator<PdfGenerateOptions>;
  private readonly docxGenerator: DocumentGenerator<DocxGenerateOptions>;
  private readonly htmlGenerator: DocumentGenerator<HtmlGenerateOptions>;
  private readonly csvParser: SpreadsheetParser & SpreadsheetWriter;
  private readonly xlsxParser: SpreadsheetParser;
  private readonly xlsxWriter: SpreadsheetWriter;
  private readonly jsonSpreadsheetWriter: SpreadsheetWriter;
  private readonly xlsParser: SpreadsheetParser;
  private readonly odsParser: SpreadsheetParser;
  private readonly handlebarsEngine: TemplateEngine;
  private readonly markdownEngine: TemplateEngine;

  public constructor(dependencies: DocumentServiceDependencies = {}) {
    const resolver = dependencies.resolver;
    this.pdfGenerator = dependencies.pdfGenerator ?? new PdfGenerator(resolver);
    this.docxGenerator = dependencies.docxGenerator ?? new DocxGenerator();
    this.htmlGenerator = dependencies.htmlGenerator ?? new HtmlGenerator();
    this.csvParser = dependencies.csvParser ?? new CsvParser();
    this.xlsxParser = dependencies.xlsxParser ?? new XlsxParser(resolver);
    this.xlsxWriter = dependencies.xlsxWriter ?? new XlsxWriter(resolver);
    this.jsonSpreadsheetWriter =
      dependencies.jsonSpreadsheetWriter ?? new JsonSpreadsheetWriter();
    this.xlsParser = dependencies.xlsParser ?? new XlsParser();
    this.odsParser = dependencies.odsParser ?? new OdsParser();
    this.handlebarsEngine =
      dependencies.handlebarsEngine ?? new HandlebarsTemplateEngine(resolver);
    this.markdownEngine =
      dependencies.markdownEngine ?? new MarkdownTemplateEngine(resolver);
  }

  public generatePdf(options: PdfGenerateOptions): Promise<Buffer> {
    return this.pdfGenerator.generate(options);
  }

  public generateDocx(options: DocxGenerateOptions): Promise<Buffer> {
    return this.docxGenerator.generate(options);
  }

  public generateHtml(options: HtmlGenerateOptions): Promise<Buffer> {
    return this.htmlGenerator.generate(options);
  }

  public parseSpreadsheet(
    format: SpreadsheetImportFormat,
    input: Buffer | string,
  ): Promise<SpreadsheetWorkbook> {
    switch (format) {
      case 'csv':
        return this.csvParser.parse(input);
      case 'xlsx':
        return this.xlsxParser.parse(input);
      case 'xls':
        return this.xlsParser.parse(input);
      case 'ods':
        return this.odsParser.parse(input);
      default:
        throw new UnsupportedDocumentFormatException(
          String(format),
          `Unknown spreadsheet import format "${String(format)}"`,
        );
    }
  }

  public exportSpreadsheet(
    workbook: SpreadsheetWorkbook,
    format: SpreadsheetExportFormat,
  ): Promise<Buffer> {
    switch (format) {
      case 'csv':
        return this.csvParser.write(workbook);
      case 'xlsx':
        return this.xlsxWriter.write(workbook);
      case 'json':
        return this.jsonSpreadsheetWriter.write(workbook);
      default:
        throw new UnsupportedDocumentFormatException(
          String(format),
          `Unknown spreadsheet export format "${String(format)}"`,
        );
    }
  }

  public renderTemplate(
    engine: TemplateEngineName,
    template: string,
    context: Readonly<Record<string, unknown>> = {},
  ): string {
    switch (engine) {
      case 'handlebars':
        return this.handlebarsEngine.render(template, context);
      case 'markdown':
        return this.markdownEngine.render(template, context);
      default:
        throw new UnsupportedDocumentFormatException(
          String(engine),
          `Unknown template engine "${String(engine)}"`,
        );
    }
  }
}
