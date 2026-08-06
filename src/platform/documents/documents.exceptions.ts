import { BusinessRuleException } from '../../core/exceptions/business-rule.exception';

/**
 * Raised when a requested document/spreadsheet format, export target, or
 * template engine is not supported by the current configuration.
 */
export class UnsupportedDocumentFormatException extends BusinessRuleException {
  public constructor(format: string, message: string) {
    super(
      'unsupported-document-format',
      message,
      'UNSUPPORTED_DOCUMENT_FORMAT',
      {
        format,
      },
    );
  }
}
