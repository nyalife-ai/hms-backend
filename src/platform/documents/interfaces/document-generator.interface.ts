/**
 * Generic, format-agnostic document content model shared by the PDF, DOCX
 * and HTML generators. Deliberately contains no business vocabulary
 * (invoices, payroll, patients, ...) — callers assemble domain content into
 * this shape before handing it to a generator.
 */

export const PDF_GENERATOR = Symbol('PDF_GENERATOR');
export const DOCX_GENERATOR = Symbol('DOCX_GENERATOR');
export const HTML_GENERATOR = Symbol('HTML_GENERATOR');

export interface DocumentMetadata {
  readonly title?: string;
  readonly author?: string;
  readonly subject?: string;
  readonly keywords?: readonly string[];
}

export interface DocumentTableModel {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export interface DocumentSection {
  readonly heading?: string;
  readonly paragraphs?: readonly string[];
  readonly table?: DocumentTableModel;
}

export interface DocumentContent {
  readonly title?: string;
  readonly sections: readonly DocumentSection[];
}

/** Context handed to per-page decoration hooks (header/footer/watermark). */
export interface PageContext {
  readonly pageIndex: number;
  readonly pageCount: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Post-processing hook applied to a fully rendered document buffer.
 * Defaults to a no-op identity function; real encryption/signature
 * providers are supplied by the caller, not by this platform slice.
 */
export type DocumentSecurityHook = (buffer: Buffer) => Buffer | Promise<Buffer>;

export interface QrCodeOptions {
  readonly data: string;
  readonly x?: number;
  readonly y?: number;
  readonly size?: number;
}

/** Contract implemented by every format-specific generator. */
export interface DocumentGenerator<TOptions> {
  readonly format: string;
  generate(options: TOptions): Promise<Buffer>;
}
