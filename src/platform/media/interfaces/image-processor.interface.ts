export type ImageFitMode = 'cover' | 'contain' | 'inside' | 'outside' | 'fill';
export type ImageOutputFormat = 'webp' | 'jpeg' | 'png';

export interface ImageResizeOptions {
  readonly width?: number;
  readonly height?: number;
  readonly fit?: ImageFitMode;
}

export interface ProcessImageOptions {
  readonly resize?: ImageResizeOptions;
  readonly format?: ImageOutputFormat;
  readonly quality?: number;
  readonly stripMetadata?: boolean;
}

export interface ImageMetadata {
  readonly width: number;
  readonly height: number;
  readonly format: string;
  readonly size: number;
}

/**
 * Image processing port. Platform ships a {@link NoopImageProcessor} default
 * and an optional {@link SharpImageProcessor}; concrete apps may implement
 * this against any other image library.
 */
export interface ImageProcessor {
  readonly name: string;
  getMetadata(input: Buffer): Promise<ImageMetadata>;
  process(input: Buffer, options: ProcessImageOptions): Promise<Buffer>;
}
