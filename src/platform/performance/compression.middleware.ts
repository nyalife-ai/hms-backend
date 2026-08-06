import { Inject, Injectable, NestMiddleware, Optional } from '@nestjs/common';
import compression from 'compression';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import { compress, CompressionAlgorithm } from './compression.util';

export interface CompressionOptions {
  readonly thresholdBytes?: number;
  readonly preferredAlgorithms?: readonly CompressionAlgorithm[];
}

export interface CompressionResult {
  readonly body: Buffer;
  readonly algorithm?: CompressionAlgorithm;
}

export const COMPRESSION_OPTIONS = Symbol('COMPRESSION_OPTIONS');

export function selectCompressionAlgorithm(
  acceptEncoding: string | undefined,
  preferred: readonly CompressionAlgorithm[] = ['br', 'gzip'],
): CompressionAlgorithm | undefined {
  if (!acceptEncoding) {
    return undefined;
  }
  const qualities = new Map<string, number>();
  for (const item of acceptEncoding.toLowerCase().split(',')) {
    const [name, ...parameters] = item.trim().split(';');
    const qualityParameter = parameters.find((value) =>
      value.trim().startsWith('q='),
    );
    const parsed = qualityParameter
      ? Number.parseFloat(qualityParameter.trim().slice(2))
      : 1;
    qualities.set(name, Number.isFinite(parsed) ? parsed : 0);
  }
  return preferred.find(
    (algorithm) => (qualities.get(algorithm) ?? qualities.get('*') ?? 0) > 0,
  );
}

export async function compressResponse(
  body: Buffer | string,
  acceptEncoding: string | undefined,
  options: CompressionOptions = {},
): Promise<CompressionResult> {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const threshold = options.thresholdBytes ?? 1_024;
  const algorithm = selectCompressionAlgorithm(
    acceptEncoding,
    options.preferredAlgorithms,
  );
  if (!algorithm || buffer.length < threshold) {
    return { body: buffer };
  }
  return { body: await compress(buffer, algorithm), algorithm };
}

function acceptEncodingFromRequest(request: Request): string | undefined {
  const header = request.headers['accept-encoding'];
  if (header === undefined) {
    return undefined;
  }
  return Array.isArray(header) ? header.join(', ') : header;
}

@Injectable()
export class CompressionMiddleware implements NestMiddleware {
  private readonly handler: RequestHandler;

  public constructor(
    @Optional()
    @Inject(COMPRESSION_OPTIONS)
    options: CompressionOptions = {},
  ) {
    const preferredAlgorithms = options.preferredAlgorithms;
    this.handler = compression({
      threshold: options.thresholdBytes ?? 1_024,
      ...(preferredAlgorithms === undefined
        ? {}
        : {
            filter: (request, response) => {
              if (!compression.filter(request, response)) {
                return false;
              }
              return (
                selectCompressionAlgorithm(
                  acceptEncodingFromRequest(request),
                  preferredAlgorithms,
                ) !== undefined
              );
            },
          }),
    });
  }

  public use(request: Request, response: Response, next: NextFunction): void {
    this.handler(request, response, next);
  }
}
