import { LogMetadata, StructuredLogger } from '../../logging/logger.interface';

/**
 * Silent logger used when logging is disabled. Still validates input so
 * behaviour matches other {@link StructuredLogger} implementations.
 */
export class NoopStructuredLogger implements StructuredLogger {
  public debug(message: string, context?: LogMetadata): void {
    this.assertMessage(message);
    void context;
  }

  public info(message: string, context?: LogMetadata): void {
    this.assertMessage(message);
    void context;
  }

  public warn(message: string, context?: LogMetadata): void {
    this.assertMessage(message);
    void context;
  }

  public error(message: string, context?: LogMetadata): void {
    this.assertMessage(message);
    void context;
  }

  private assertMessage(message: string): void {
    if (message.trim().length === 0) {
      throw new Error('Log message must not be empty');
    }
  }
}
