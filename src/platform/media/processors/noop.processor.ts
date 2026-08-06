import type {
  ImageMetadata,
  ImageProcessor,
} from '../interfaces/image-processor.interface';
import { detectImageFormat } from '../image-validation';

/**
 * Pass-through image processor used as the default when no real image
 * library is configured (e.g. in unit tests, or minimal deployments that
 * never install `sharp`). It performs no resizing/compression; it only
 * reports metadata derived from magic-byte sniffing.
 */
export class NoopImageProcessor implements ImageProcessor {
  public readonly name = 'noop';

  public getMetadata(input: Buffer): Promise<ImageMetadata> {
    return Promise.resolve({
      width: 0,
      height: 0,
      format: detectImageFormat(input) ?? 'unknown',
      size: input.length,
    });
  }

  /** Ignores `options` — this processor never touches pixel data. */
  public process(input: Buffer): Promise<Buffer> {
    return Promise.resolve(input);
  }
}
