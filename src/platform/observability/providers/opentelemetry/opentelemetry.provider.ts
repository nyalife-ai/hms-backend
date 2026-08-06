import { ModuleResolver, tryLoadDriver } from '../load-optional';
import {
  createExporter,
  OtelExporterKind,
  OtelExporterResult,
} from './exporter.factory';
import {
  ALL_INSTRUMENTATION_NAMES,
  InstrumentationName,
  LoadedInstrumentation,
  loadInstrumentations,
} from './instrumentation.loader';
import { OtelMeterLike } from './opentelemetry.metrics';
import { OtelTracerLike } from './opentelemetry.tracer';
import { ResourceAttributes, ResourceBuilder } from './resource.builder';

/** Minimal duck-typed surface of the `@opentelemetry/api` package entrypoint. */
export interface OpenTelemetryApiLike {
  readonly trace: {
    getTracer(name: string, version?: string): OtelTracerLike;
  };
  readonly metrics?: {
    getMeter(name: string, version?: string): OtelMeterLike;
  };
}

export interface OpenTelemetryProviderOptions {
  readonly serviceName: string;
  readonly serviceVersion?: string;
  readonly environment?: string;
  readonly exporterKind?: OtelExporterKind;
  readonly endpoint?: string;
  readonly instrumentations?: readonly InstrumentationName[];
  readonly resolver?: ModuleResolver;
}

/**
 * Orchestrates OTEL resource/exporter/instrumentation resolution without
 * ever importing `@opentelemetry/*` packages directly. `available` reflects
 * whether `@opentelemetry/api` could be resolved at all; individual
 * exporters/instrumentations report their own availability independently
 * since a project may install the API without every exporter.
 */
export class OpenTelemetryProvider {
  public readonly resource: ResourceAttributes;
  public readonly exporter: OtelExporterResult;
  public readonly instrumentations: readonly LoadedInstrumentation[];
  public readonly available: boolean;
  private readonly api?: OpenTelemetryApiLike;

  public constructor(options: OpenTelemetryProviderOptions) {
    this.resource = new ResourceBuilder().build({
      serviceName: options.serviceName,
      serviceVersion: options.serviceVersion,
      environment: options.environment,
    });
    this.exporter = createExporter(options.exporterKind ?? 'console', {
      endpoint: options.endpoint,
      resolver: options.resolver,
    });
    this.instrumentations = loadInstrumentations(
      options.instrumentations ?? ALL_INSTRUMENTATION_NAMES,
      options.resolver,
    );
    this.api = tryLoadDriver<OpenTelemetryApiLike>(
      '@opentelemetry/api',
      options.resolver,
    );
    this.available = this.api !== undefined;
  }

  public getTracer(name: string): OtelTracerLike | undefined {
    return this.api?.trace.getTracer(name);
  }

  public getMeter(name: string): OtelMeterLike | undefined {
    return this.api?.metrics?.getMeter(name);
  }
}
