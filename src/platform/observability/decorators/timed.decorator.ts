import { CustomDecorator, SetMetadata } from '@nestjs/common';

export const TIMED_METADATA = 'platform:observability:timed';

export interface TimedOptions {
  readonly name?: string;
  /** Logs a warning through the injected logger when exceeded. Disabled when omitted. */
  readonly warnThresholdMs?: number;
}

/**
 * Marks a method to have its duration recorded by
 * {@link RequestTimingInterceptor} / custom interceptors that read this
 * metadata.
 */
export function Timed(options: TimedOptions = {}): CustomDecorator {
  if (options.warnThresholdMs !== undefined && options.warnThresholdMs <= 0) {
    throw new RangeError('Timed warnThresholdMs must be a positive number');
  }
  return SetMetadata(TIMED_METADATA, options);
}
