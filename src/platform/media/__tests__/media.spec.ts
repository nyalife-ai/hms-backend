import {
  detectImageFormat,
  ImageValidationError,
  validateImageBuffer,
} from '../image-validation';
import { NoopImageProcessor } from '../processors/noop.processor';
import {
  MissingImageDriverError,
  SharpImageProcessor,
} from '../processors/sharp.processor';
import {
  ImagePipelineService,
  VirusDetectedError,
  type MetadataStripper,
  type VirusScanner,
} from '../image-pipeline.service';
import type {
  ImageMetadata,
  ImageProcessor,
  ProcessImageOptions,
} from '../interfaces/image-processor.interface';
import {
  IMAGE_PROCESSOR,
  METADATA_STRIPPER,
  VIRUS_SCANNER,
} from '../media.tokens';

const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const pngBuffer = (extra = 100): Buffer =>
  Buffer.concat([PNG_HEADER, Buffer.alloc(extra)]);
const jpegBuffer = (): Buffer => Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x00]);
const gif87Buffer = (): Buffer => Buffer.from('GIF87a-rest', 'ascii');
const gif89Buffer = (): Buffer => Buffer.from('GIF89a-rest', 'ascii');
const webpBuffer = (): Buffer =>
  Buffer.concat([
    Buffer.from('RIFF', 'ascii'),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from('WEBP', 'ascii'),
  ]);

describe('media platform / image-validation', () => {
  it('detects each recognized magic-byte signature', () => {
    expect(detectImageFormat(pngBuffer())).toBe('png');
    expect(detectImageFormat(jpegBuffer())).toBe('jpeg');
    expect(detectImageFormat(gif87Buffer())).toBe('gif');
    expect(detectImageFormat(gif89Buffer())).toBe('gif');
    expect(detectImageFormat(webpBuffer())).toBe('webp');
    expect(detectImageFormat(Buffer.from('not-an-image'))).toBeUndefined();
  });

  it('rejects too-short buffers for every signature without throwing', () => {
    expect(detectImageFormat(Buffer.alloc(2))).toBeUndefined();
    expect(detectImageFormat(Buffer.from('GI'))).toBeUndefined();
    expect(detectImageFormat(Buffer.from('RIFF'))).toBeUndefined();
  });

  it('accepts a valid image within limits', () => {
    expect(validateImageBuffer(pngBuffer())).toBe('png');
  });

  it('rejects an empty buffer', () => {
    expect(() => validateImageBuffer(Buffer.alloc(0))).toThrow(
      ImageValidationError,
    );
  });

  it('rejects a buffer exceeding maxBytes', () => {
    expect(() =>
      validateImageBuffer(pngBuffer(1000), { maxBytes: 10 }),
    ).toThrow(/exceeds maximum size/);
  });

  it('rejects an unrecognized format', () => {
    expect(() => validateImageBuffer(Buffer.from('nonsense'))).toThrow(
      /Unrecognized image format/,
    );
  });

  it('rejects a format outside the allow-list', () => {
    expect(() =>
      validateImageBuffer(jpegBuffer(), { allowedFormats: ['png'] }),
    ).toThrow(/is not allowed/);
  });
});

describe('media platform / noop processor', () => {
  it('reports metadata derived from magic bytes and passes buffers through unmodified', async () => {
    const processor = new NoopImageProcessor();
    expect(processor.name).toBe('noop');
    const metadata = await processor.getMetadata(pngBuffer(5));
    expect(metadata).toEqual({ width: 0, height: 0, format: 'png', size: 13 });

    const unknown = await processor.getMetadata(Buffer.from('nope'));
    expect(unknown.format).toBe('unknown');

    const output = await processor.process(pngBuffer(), { format: 'webp' });
    expect(output).toEqual(pngBuffer());
  });
});

describe('media platform / sharp processor', () => {
  it('uses the real require() by default and fails when sharp is not installed', () => {
    expect(() => new SharpImageProcessor()).toThrow(MissingImageDriverError);
  });

  it('throws MissingImageDriverError when the module cannot be resolved', () => {
    const resolver = jest.fn(() => {
      throw new Error('Cannot find module');
    });
    expect(() => new SharpImageProcessor(resolver)).toThrow(
      MissingImageDriverError,
    );
    expect(resolver).toHaveBeenCalledWith('sharp');
  });

  it('throws MissingImageDriverError when the resolved module is not callable', () => {
    const resolver = jest.fn(() => ({ notAFunction: true }));
    expect(() => new SharpImageProcessor(resolver)).toThrow(
      MissingImageDriverError,
    );
  });

  it('accepts a CJS-style module export (default property)', () => {
    const factory = jest.fn(() => makeFakeSharpInstance());
    const resolver = jest.fn(() => ({ default: factory }));
    const processor = new SharpImageProcessor(resolver);
    expect(processor.name).toBe('sharp');
  });

  it('reads metadata via the resolved factory', async () => {
    const instance = makeFakeSharpInstance({
      width: 640,
      height: 480,
      format: 'png',
    });
    const factory = jest.fn(() => instance);
    const processor = new SharpImageProcessor(() => factory);
    const metadata = await processor.getMetadata(Buffer.from('img'));
    expect(metadata).toEqual({
      width: 640,
      height: 480,
      format: 'png',
      size: 3,
    });
  });

  it('falls back to defaults when sharp metadata omits width/height/format', async () => {
    const instance = makeFakeSharpInstance({});
    const factory = jest.fn(() => instance);
    const processor = new SharpImageProcessor(() => factory);
    const metadata = await processor.getMetadata(Buffer.from('img'));
    expect(metadata).toEqual({
      width: 0,
      height: 0,
      format: 'unknown',
      size: 3,
    });
  });

  it('resizes and converts to webp by default with default quality', async () => {
    const instance = makeFakeSharpInstance();
    const factory = jest.fn(() => instance);
    const processor = new SharpImageProcessor(() => factory);
    await processor.process(Buffer.from('img'), {
      resize: { width: 100, height: 200 },
    });
    expect(instance.resize).toHaveBeenCalledWith({
      width: 100,
      height: 200,
      fit: 'inside',
    });
    expect(instance.webp).toHaveBeenCalledWith({ quality: 80 });
  });

  it('supports jpeg and png output formats and explicit fit/quality', async () => {
    const jpegInstance = makeFakeSharpInstance();
    const jpegProcessor = new SharpImageProcessor(() => () => jpegInstance);
    await jpegProcessor.process(Buffer.from('img'), {
      resize: { width: 50, fit: 'cover' },
      format: 'jpeg',
      quality: 50,
    });
    expect(jpegInstance.resize).toHaveBeenCalledWith({
      width: 50,
      height: undefined,
      fit: 'cover',
    });
    expect(jpegInstance.jpeg).toHaveBeenCalledWith({ quality: 50 });

    const pngInstance = makeFakeSharpInstance();
    const pngProcessor = new SharpImageProcessor(() => () => pngInstance);
    await pngProcessor.process(Buffer.from('img'), { format: 'png' });
    expect(pngInstance.png).toHaveBeenCalled();
    expect(pngInstance.resize).not.toHaveBeenCalled();
  });
});

function makeFakeSharpInstance(
  metadata: {
    width?: number;
    height?: number;
    format?: string;
  } = { width: 10, height: 10, format: 'png' },
) {
  const instance = {
    resize: jest.fn(function (this: unknown) {
      return instance;
    }),
    webp: jest.fn(function (this: unknown) {
      return instance;
    }),
    jpeg: jest.fn(function (this: unknown) {
      return instance;
    }),
    png: jest.fn(function (this: unknown) {
      return instance;
    }),
    toBuffer: jest.fn(() => Promise.resolve(Buffer.from('processed'))),
    metadata: jest.fn(() => Promise.resolve(metadata)),
  };
  return instance;
}

describe('media platform / image pipeline', () => {
  class FakeProcessor implements ImageProcessor {
    public readonly name = 'fake';
    public readonly calls: ProcessImageOptions[] = [];

    public getMetadata(input: Buffer): Promise<ImageMetadata> {
      return Promise.resolve({
        width: 1000,
        height: 800,
        format: 'png',
        size: input.length,
      });
    }

    public process(
      _input: Buffer,
      options: ProcessImageOptions,
    ): Promise<Buffer> {
      this.calls.push(options);
      return Promise.resolve(
        Buffer.from(`variant-${String(options.resize?.width)}`),
      );
    }
  }

  it('validates, generates default small/medium/large webp variants', async () => {
    const processor = new FakeProcessor();
    const pipeline = new ImagePipelineService({ processor });
    const result = await pipeline.process(pngBuffer());
    expect(result.original.format).toBe('png');
    expect(result.variants.map((variant) => variant.name)).toEqual([
      'small',
      'medium',
      'large',
    ]);
    expect(result.variants.every((variant) => variant.format === 'webp')).toBe(
      true,
    );
    expect(processor.calls).toHaveLength(3);
    expect(processor.calls[0]).toMatchObject({
      format: 'webp',
      quality: 80,
      stripMetadata: true,
    });
  });

  it('supports custom variants and quality', async () => {
    const processor = new FakeProcessor();
    const pipeline = new ImagePipelineService({
      processor,
      variants: [{ name: 'tiny', width: 64 }],
      quality: 40,
    });
    const result = await pipeline.process(pngBuffer());
    expect(result.variants).toHaveLength(1);
    expect(result.variants[0].width).toBe(64);
    expect(processor.calls[0].quality).toBe(40);
  });

  it('rejects invalid images before touching the processor', async () => {
    const processor = new FakeProcessor();
    const pipeline = new ImagePipelineService({ processor });
    await expect(pipeline.process(Buffer.alloc(0))).rejects.toThrow(
      ImageValidationError,
    );
  });

  it('runs the virus scanner hook and throws on infection', async () => {
    const processor = new FakeProcessor();
    const infectedScanner: VirusScanner = {
      scan: () => Promise.resolve({ infected: true, signature: 'EICAR' }),
    };
    const pipeline = new ImagePipelineService({
      processor,
      virusScanner: infectedScanner,
    });
    await expect(pipeline.process(pngBuffer())).rejects.toThrow(
      VirusDetectedError,
    );
    await expect(pipeline.process(pngBuffer())).rejects.toThrow(/EICAR/);
  });

  it('passes clean scans through and throws a generic message with no signature', async () => {
    const processor = new FakeProcessor();
    const cleanScanner: VirusScanner = {
      scan: () => Promise.resolve({ infected: false }),
    };
    const pipeline = new ImagePipelineService({
      processor,
      virusScanner: cleanScanner,
    });
    const result = await pipeline.process(pngBuffer());
    expect(result.variants).toHaveLength(3);

    const unsignedInfected: VirusScanner = {
      scan: () => Promise.resolve({ infected: true }),
    };
    const infectedPipeline = new ImagePipelineService({
      processor,
      virusScanner: unsignedInfected,
    });
    await expect(infectedPipeline.process(pngBuffer())).rejects.toThrow(
      'Virus detected in upload',
    );
  });

  it('runs the metadata stripper hook before processing', async () => {
    const processor = new FakeProcessor();
    const stripper: MetadataStripper = {
      strip: (buffer) =>
        Promise.resolve(Buffer.concat([buffer, Buffer.from('!')])),
    };
    const strippedInputs: Buffer[] = [];
    const capturingProcessor: ImageProcessor = {
      name: 'capture',
      getMetadata: (input) => {
        strippedInputs.push(input);
        return processor.getMetadata(input);
      },
      process: (input, options) => {
        strippedInputs.push(input);
        return processor.process(input, options);
      },
    };
    const pipeline = new ImagePipelineService({
      processor: capturingProcessor,
      metadataStripper: stripper,
      variants: [{ name: 'small', width: 100 }],
    });
    await pipeline.process(pngBuffer());
    expect(strippedInputs.every((buf) => buf.toString().endsWith('!'))).toBe(
      true,
    );
  });

  it('exposes DI tokens', () => {
    expect(typeof IMAGE_PROCESSOR).toBe('symbol');
    expect(typeof VIRUS_SCANNER).toBe('symbol');
    expect(typeof METADATA_STRIPPER).toBe('symbol');
  });
});
