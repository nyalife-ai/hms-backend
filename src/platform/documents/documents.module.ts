import { DynamicModule, Module } from '@nestjs/common';
import {
  DOCX_GENERATOR,
  HTML_GENERATOR,
  PDF_GENERATOR,
} from './interfaces/document-generator.interface';
import {
  SPREADSHEET_PARSER,
  SPREADSHEET_WRITER,
} from './interfaces/spreadsheet-parser.interface';
import { TEMPLATE_ENGINE } from './interfaces/template-engine.interface';
import type { ModuleResolver } from './optional-driver';
import { DocumentService } from './document.service';
import { DocxGenerator } from './generators/docx.generator';
import { HtmlGenerator } from './generators/html.generator';
import { PdfGenerator } from './generators/pdf.generator';
import { CsvParser } from './spreadsheets/csv.parser';
import { XlsxWriter } from './spreadsheets/xlsx.writer';
import { HandlebarsTemplateEngine } from './templates/handlebars.engine';

export interface DocumentsModuleOptions {
  /** Custom module resolver, primarily for tests that stub optional drivers. */
  readonly resolver?: ModuleResolver;
}

/**
 * Optional Nest wiring for the documents platform slice. All generators,
 * parsers and template engines are stateless and driver-optional, so
 * `register()` never fails at bootstrap time — missing drivers only
 * surface when a caller actually needs them (e.g. parsing XLSX without
 * `exceljs` installed).
 */
@Module({})
export class DocumentsModule {
  public static register(options: DocumentsModuleOptions = {}): DynamicModule {
    const resolver = options.resolver;
    return {
      module: DocumentsModule,
      providers: [
        { provide: PDF_GENERATOR, useValue: new PdfGenerator(resolver) },
        { provide: DOCX_GENERATOR, useValue: new DocxGenerator() },
        { provide: HTML_GENERATOR, useValue: new HtmlGenerator() },
        { provide: SPREADSHEET_PARSER, useValue: new CsvParser() },
        { provide: SPREADSHEET_WRITER, useValue: new XlsxWriter(resolver) },
        {
          provide: TEMPLATE_ENGINE,
          useValue: new HandlebarsTemplateEngine(resolver),
        },
        {
          provide: DocumentService,
          useFactory: (): DocumentService => new DocumentService({ resolver }),
        },
      ],
      exports: [
        PDF_GENERATOR,
        DOCX_GENERATOR,
        HTML_GENERATOR,
        SPREADSHEET_PARSER,
        SPREADSHEET_WRITER,
        TEMPLATE_ENGINE,
        DocumentService,
      ],
    };
  }
}
