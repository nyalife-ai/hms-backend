import type {
  ImageMetadata,
  ImageProcessor,
} from './interfaces/image-processor.interface';
import {
  type ImageValidationOptions,
  validateImageBuffer,
} from './image-validation';

export interface VirusScanResult {
  readonly infected: boolean;
  readonly signature?: string;
}

/**
 * Virus-scan hook. Platform ships no concrete implementation — wire this to
 * ClamAV, a cloud AV API, or similar in the consuming application.
 */
export interface VirusScanner {
  scan(buffer: Buffer): Promise<VirusScanResult>;
}

export class VirusDetectedError extends Error {
  public constructor(signature?: string) {
    super(
      signature ? `Virus detected: ${signature}` : 'Virus detected in upload',
    );
    this.name = 'VirusDetectedError';
  }
}

/** Metadata-stripping hook (EXIF/GPS/etc). Runs before variant generation. */
export interface MetadataStripper {
  strip(buffer: Buffer): Promise<Buffer>;
}

export interface ImageVariantConfig {
  readonly name: string;
  readonly width: number;
}

export interface ImageVariant {
  readonly name: string;
  readonly width: number;
  readonly format: 'webp';
  readonly buffer: Buffer;
}

export interface ProcessedImage {
  readonly original: ImageMetadata;
  readonly variants: readonly ImageVariant[];
}

export interface ImagePipelineOptions {
  readonly processor: ImageProcessor;
  readonly virusScanner?: VirusScanner;
  readonly metadataStripper?: MetadataStripper;
  readonly variants?: readonly ImageVariantConfig[];
  readonly validation?: ImageValidationOptions;
  readonly quality?: number;
}

export const DEFAULT_IMAGE_VARIANTS: readonly ImageVariantConfig[] = [
  { name: 'small', width: 320 },
  { name: 'medium', width: 768 },
  { name: 'large', width: 1600 },
];

/**
 * Orchestrates validation, virus scanning, metadata stripping, and
 * small/medium/large WebP variant generation for an uploaded image. Delegates
 * the actual pixel work to an injected {@link ImageProcessor} port so tests
 * never require a real image library.
 */
export class ImagePipelineService {
  private readonly variants: readonly ImageVariantConfig[];
  private readonly quality: number;

  public constructor(private readonly options: ImagePipelineOptions) {
    this.variants = options.variants ?? DEFAULT_IMAGE_VARIANTS;
    this.quality = options.quality ?? 80;
  }

  public async process(input: Buffer): Promise<ProcessedImage> {
    validateImageBuffer(input, this.options.validation);

    if (this.options.virusScanner) {
      const result = await this.options.virusScanner.scan(input);
      if (result.infected) {
        throw new VirusDetectedError(result.signature);
      }
    }

    const working = this.options.metadataStripper
      ? await this.options.metadataStripper.strip(input)
      : input;

    const original = await this.options.processor.getMetadata(working);
    const variants = await Promise.all(
      this.variants.map((config) => this.buildVariant(working, config)),
    );

    return { original, variants };
  }

  private async buildVariant(
    working: Buffer,
    config: ImageVariantConfig,
  ): Promise<ImageVariant> {
    const buffer = await this.options.processor.process(working, {
      resize: { width: config.width, fit: 'inside' },
      format: 'webp',
      quality: this.quality,
      stripMetadata: true,
    });
    return { name: config.name, width: config.width, format: 'webp', buffer };
  }
}
