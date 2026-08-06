import { ModuleResolver, tryLoadDriver } from '../load-optional';

export type OtelExporterKind =
  'otlp' | 'jaeger' | 'zipkin' | 'tempo' | 'prometheus' | 'console' | 'noop';

export interface OtelExporterOptions {
  readonly endpoint?: string;
  readonly resolver?: ModuleResolver;
}

export interface OtelExporterResult {
  readonly kind: OtelExporterKind;
  readonly available: boolean;
  readonly exporter?: unknown;
  readonly packageName?: string;
}

/** Tempo speaks the OTLP protocol, so it reuses the OTLP exporter package. */
const EXPORTER_PACKAGES: Readonly<Partial<Record<OtelExporterKind, string>>> =
  Object.freeze({
    otlp: '@opentelemetry/exporter-trace-otlp-http',
    tempo: '@opentelemetry/exporter-trace-otlp-http',
    jaeger: '@opentelemetry/exporter-jaeger',
    zipkin: '@opentelemetry/exporter-zipkin',
    prometheus: '@opentelemetry/exporter-prometheus',
  });

type ExporterConstructor = new (options?: Record<string, unknown>) => unknown;

/**
 * Resolves an OTEL span/metric exporter by kind. Never throws: when the
 * backing package is not installed, `available` is `false` and callers fall
 * back to console/noop behaviour.
 */
export function createExporter(
  kind: OtelExporterKind,
  options: OtelExporterOptions = {},
): OtelExporterResult {
  if (kind === 'noop') {
    return Object.freeze({ kind, available: true });
  }
  if (kind === 'console') {
    return createFromPackage(
      kind,
      '@opentelemetry/sdk-trace-base',
      { className: 'ConsoleSpanExporter' },
      options,
    );
  }
  const packageName = EXPORTER_PACKAGES[kind];
  if (!packageName) {
    throw new RangeError(
      `Unknown OpenTelemetry exporter kind: ${String(kind)}`,
    );
  }
  return createFromPackage(kind, packageName, {}, options);
}

function createFromPackage(
  kind: OtelExporterKind,
  packageName: string,
  select: { readonly className?: string },
  options: OtelExporterOptions,
): OtelExporterResult {
  const loaded = tryLoadDriver<Record<string, unknown>>(
    packageName,
    options.resolver,
  );
  if (!loaded) {
    return Object.freeze({ kind, available: false, packageName });
  }
  const ExporterCtor = resolveConstructor(loaded, select.className);
  if (!ExporterCtor) {
    return Object.freeze({ kind, available: false, packageName });
  }
  const exporter = new ExporterCtor(
    options.endpoint ? { url: options.endpoint } : undefined,
  );
  return Object.freeze({ kind, available: true, exporter, packageName });
}

function resolveConstructor(
  loaded: Record<string, unknown>,
  className: string | undefined,
): ExporterConstructor | undefined {
  if (className && typeof loaded[className] === 'function') {
    return loaded[className] as ExporterConstructor;
  }
  const candidate = Object.values(loaded).find(
    (value): value is ExporterConstructor => typeof value === 'function',
  );
  return candidate;
}
