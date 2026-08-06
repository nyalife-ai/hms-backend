import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export interface SecurityCorsConfig {
  readonly origins: readonly string[];
  readonly credentials?: boolean;
  readonly methods?: readonly string[];
  readonly allowedHeaders?: readonly string[];
  readonly maxAge?: number;
}

export function buildCorsOptions(config: SecurityCorsConfig): CorsOptions {
  return {
    origin: [...config.origins],
    credentials: config.credentials ?? true,
    methods: [...(config.methods ?? ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])],
    allowedHeaders: [
      ...(config.allowedHeaders ?? ['Content-Type', 'Authorization']),
    ],
    maxAge: config.maxAge ?? 600,
  };
}
