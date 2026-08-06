import type { HeaderValue } from '../../logging/correlation';
import { SpanContext } from '../../tracing/tracer.interface';

/**
 * Header used to propagate trace context across process boundaries.
 * Named after the W3C Trace Context header but uses a simpler
 * `traceId:spanId` encoding so it works with the id formats produced by
 * every {@link Tracer} implementation in this platform (including the
 * UUID-based ids from {@link InMemoryTracer}), not just 16/8-byte hex ids.
 */
export const TRACE_CONTEXT_HEADER = 'traceparent';

export function encodeSpanContext(context: SpanContext): string {
  if (
    context.traceId.trim().length === 0 ||
    context.spanId.trim().length === 0
  ) {
    throw new Error('SpanContext requires non-empty traceId and spanId');
  }
  return `${encodeURIComponent(context.traceId)}:${encodeURIComponent(context.spanId)}`;
}

export function decodeSpanContext(
  value: string | undefined,
): SpanContext | undefined {
  if (!value) {
    return undefined;
  }
  const separatorIndex = value.indexOf(':');
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    return undefined;
  }
  const traceId = decodeURIComponent(value.slice(0, separatorIndex));
  const spanId = decodeURIComponent(value.slice(separatorIndex + 1));
  return Object.freeze({ traceId, spanId });
}

export function injectTraceContext(
  context: SpanContext,
  carrier: Readonly<Record<string, string>> = {},
): Readonly<Record<string, string>> {
  return Object.freeze({
    ...carrier,
    [TRACE_CONTEXT_HEADER]: encodeSpanContext(context),
  });
}

export function extractTraceContext(
  carrier: Readonly<Record<string, HeaderValue>>,
): SpanContext | undefined {
  const raw: HeaderValue = carrier[TRACE_CONTEXT_HEADER];
  let value: string | undefined;
  if (typeof raw === 'string') {
    value = raw;
  } else if (Array.isArray(raw) && typeof raw[0] === 'string') {
    value = raw[0];
  } else {
    value = undefined;
  }
  return decodeSpanContext(value);
}
