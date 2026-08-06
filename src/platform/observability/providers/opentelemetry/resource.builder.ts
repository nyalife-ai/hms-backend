export type ResourceAttributeValue = string | number | boolean;
export type ResourceAttributes = Readonly<
  Record<string, ResourceAttributeValue>
>;

export interface OpenTelemetryResourceInput {
  readonly serviceName: string;
  readonly serviceVersion?: string;
  readonly environment?: string;
  readonly attributes?: Readonly<Record<string, ResourceAttributeValue>>;
}

/**
 * Builds OTEL resource attributes without depending on `@opentelemetry/resources`.
 * The resulting plain object can be passed to a real `Resource` constructor
 * when the OTEL SDK is installed, or used as-is for logging/diagnostics.
 */
export class ResourceBuilder {
  public build(input: OpenTelemetryResourceInput): ResourceAttributes {
    if (input.serviceName.trim().length === 0) {
      throw new Error(
        'OpenTelemetry resource requires a non-empty serviceName',
      );
    }
    return Object.freeze({
      'service.name': input.serviceName,
      ...(input.serviceVersion
        ? { 'service.version': input.serviceVersion }
        : {}),
      ...(input.environment
        ? { 'deployment.environment': input.environment }
        : {}),
      ...(input.attributes ?? {}),
    });
  }
}
