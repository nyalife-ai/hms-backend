/**
 * Structured metadata attached to application exceptions.
 */
export type ExceptionMetadata = Readonly<
  Record<string, Readonly<string | number | boolean | null | undefined>>
>;

export type BaseApplicationExceptionProps = {
  readonly message: string;
  readonly code: string;
  readonly metadata?: ExceptionMetadata;
  readonly cause?: Error;
};

/**
 * Root of the application exception hierarchy.
 * Never maps directly to HTTP — adapters in platform decide status codes.
 */
export abstract class BaseApplicationException extends Error {
  public readonly code: string;
  public readonly metadata: ExceptionMetadata;
  public readonly timestamp: Date;
  public readonly cause?: Error;

  protected constructor(props: BaseApplicationExceptionProps) {
    super(props.message);
    this.name = new.target.name;
    this.code = props.code;
    this.metadata = Object.freeze({ ...(props.metadata ?? {}) });
    this.timestamp = new Date();
    this.cause = props.cause;

    // Restore prototype chain for `instanceof` when targeting ES5+ transpile.
    Object.setPrototypeOf(this, new.target.prototype);
  }

  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      metadata: this.metadata,
      timestamp: this.timestamp.toISOString(),
    };
  }
}
