import {
  BaseApplicationException,
  type ExceptionMetadata,
} from './base-application.exception';

/**
 * Raised when a named business rule fails evaluation.
 */
export class BusinessRuleException extends BaseApplicationException {
  public readonly rule: string;

  public constructor(
    rule: string,
    message: string,
    code = 'BUSINESS_RULE_VIOLATION',
    metadata?: ExceptionMetadata,
    cause?: Error,
  ) {
    super({
      message,
      code,
      // Spread metadata first so reserved `rule` cannot be overwritten.
      metadata: { ...metadata, rule },
      cause,
    });
    this.rule = rule;
  }

  public override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      rule: this.rule,
    };
  }
}
