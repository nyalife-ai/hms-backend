export interface MetricsEndpointResponse {
  readonly contentType: 'text/plain; version=0.0.4; charset=utf-8';
  readonly body: string;
}

export interface MetricsEndpoint {
  read(): MetricsEndpointResponse;
}
