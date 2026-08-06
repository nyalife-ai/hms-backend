import { CustomDecorator, SetMetadata } from '@nestjs/common';
import { SpanAttribute } from '../tracing/tracer.interface';

export const TRACE_METADATA = 'platform:observability:trace';

export interface TraceOptions {
  readonly name?: string;
  readonly attributes?: Readonly<Record<string, SpanAttribute>>;
}

/**
 * Marks a method to be wrapped in a {@link Tracer} span by
 * {@link TracingInterceptor}. Reads via `Reflector.getAllAndOverride`, so it
 * may be applied at the class level and overridden per-method.
 */
export function Trace(options: TraceOptions = {}): CustomDecorator {
  return SetMetadata(TRACE_METADATA, options);
}
