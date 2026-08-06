import type {
  ImageMetadata,
  ImageProcessor,
  ProcessImageOptions,
} from '../interfaces/image-processor.interface';

/**
 * Optional driver loading, duplicated locally (rather than imported from
 * `src/infrastructure`) so platform never reverse-depends on infrastructure.
 * See `src/infrastructure/optional-driver.ts` for the canonical pattern.
 */
export type ModuleResolver = (specifier: string) => unknown;

export class MissingImageDriverError extends Error {
  public readonly packageName: string;
  public readonly cause?: unknown;

  public constructor(packageName: string, cause?: unknown) {
    super(
      `Driver "${packageName}" is not installed. Run: yarn add ${packageName}`,
    );
    this.name = 'MissingImageDriverError';
    this.packageName = packageName;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

interface SharpMetadata {
  readonly width?: number;
  readonly height?: number;
  readonly format?: string;
}

interface SharpInstance {
  resize(options: {
    width?: number;
    height?: number;
    fit?: string;
  }): SharpInstance;
  webp(options: { quality: number }): SharpInstance;
  jpeg(options: { quality: number }): SharpInstance;
  png(): SharpInstance;
  toBuffer(): Promise<Buffer>;
  metadata(): Promise<SharpMetadata>;
}

export type SharpFactory = (input: Buffer) => SharpInstance;

const defaultResolver: ModuleResolver = (specifier) =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(specifier) as unknown;

function extractFactory(resolvedModule: unknown): unknown {
  if (typeof resolvedModule === 'function') {
    return resolvedModule;
  }
  if (
    resolvedModule !== null &&
    typeof resolvedModule === 'object' &&
    'default' in resolvedModule
  ) {
    return (resolvedModule as { default?: unknown }).default;
  }
  return undefined;
}

function resolveSharpFactory(resolver: ModuleResolver): SharpFactory {
  let resolvedModule: unknown;
  try {
    resolvedModule = resolver('sharp');
  } catch (error: unknown) {
    throw new MissingImageDriverError('sharp', error);
  }
  const factory = extractFactory(resolvedModule);
  if (typeof factory !== 'function') {
    throw new MissingImageDriverError('sharp');
  }
  return factory as SharpFactory;
}

/**
 * Sharp-backed image processor. `sharp` is an optional peer dependency —
 * install it with `yarn add sharp` to enable resize/compress/WebP
 * conversion. Module resolution is injectable so tests can supply a fake
 * module without the real package being installed.
 */
export class SharpImageProcessor implements ImageProcessor {
  public readonly name = 'sharp';
  private readonly factory: SharpFactory;

  public constructor(resolver: ModuleResolver = defaultResolver) {
    this.factory = resolveSharpFactory(resolver);
  }

  public async getMetadata(input: Buffer): Promise<ImageMetadata> {
    const metadata = await this.factory(input).metadata();
    return {
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
      format: metadata.format ?? 'unknown',
      size: input.length,
    };
  }

  public process(input: Buffer, options: ProcessImageOptions): Promise<Buffer> {
    let pipeline = this.factory(input);
    if (options.resize) {
      pipeline = pipeline.resize({
        width: options.resize.width,
        height: options.resize.height,
        fit: options.resize.fit ?? 'inside',
      });
    }
    const quality = options.quality ?? 80;
    const format = options.format ?? 'webp';
    if (format === 'jpeg') {
      pipeline = pipeline.jpeg({ quality });
    } else if (format === 'png') {
      pipeline = pipeline.png();
    } else {
      pipeline = pipeline.webp({ quality });
    }
    return pipeline.toBuffer();
  }
}
