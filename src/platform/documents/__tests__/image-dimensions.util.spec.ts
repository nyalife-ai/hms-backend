import { readFileSync } from 'fs';
import { join } from 'path';
import { fitWithin, getImageDimensions } from '../image-dimensions.util';

function jpegFixture(width: number, height: number): Buffer {
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]);
  const dims = Buffer.alloc(4);
  dims.writeUInt16BE(height, 0);
  dims.writeUInt16BE(width, 2);
  return Buffer.concat([header, dims, Buffer.alloc(10)]);
}

function gifFixture(width: number, height: number): Buffer {
  const buf = Buffer.alloc(10);
  buf.write('GIF89a', 0, 'ascii');
  buf.writeUInt16LE(width, 6);
  buf.writeUInt16LE(height, 8);
  return buf;
}

function bmpFixture(width: number, height: number): Buffer {
  const buf = Buffer.alloc(26);
  buf.write('BM', 0, 'ascii');
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(-height, 22); // negative height = top-down bitmap, common case
  return buf;
}

function webpVp8xFixture(width: number, height: number): Buffer {
  const buf = Buffer.alloc(30);
  buf.write('RIFF', 0, 'ascii');
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8X', 12, 'ascii');
  const w = width - 1;
  const h = height - 1;
  buf[24] = w & 0xff;
  buf[25] = (w >> 8) & 0xff;
  buf[26] = (w >> 16) & 0xff;
  buf[27] = h & 0xff;
  buf[28] = (h >> 8) & 0xff;
  buf[29] = (h >> 16) & 0xff;
  return buf;
}

describe('getImageDimensions', () => {
  it('reads real PNG dimensions from the radiology logo asset', () => {
    const buf = readFileSync(
      join(__dirname, '../../../modules/radiology/reporting/assets/nyalife-logo.png'),
    );
    expect(getImageDimensions(buf)).toEqual({ width: 480, height: 230 });
  });

  it('reads JPEG dimensions from a synthetic SOF0 header', () => {
    expect(getImageDimensions(jpegFixture(300, 150))).toEqual({ width: 300, height: 150 });
  });

  it('reads GIF dimensions', () => {
    expect(getImageDimensions(gifFixture(200, 100))).toEqual({ width: 200, height: 100 });
  });

  it('reads BMP dimensions (top-down, negative height)', () => {
    expect(getImageDimensions(bmpFixture(64, 32))).toEqual({ width: 64, height: 32 });
  });

  it('reads WebP VP8X dimensions', () => {
    expect(getImageDimensions(webpVp8xFixture(150, 75))).toEqual({ width: 150, height: 75 });
  });

  it('returns null for corrupt/unrecognized data instead of throwing', () => {
    expect(getImageDimensions(Buffer.from('not an image'))).toBeNull();
    expect(getImageDimensions(Buffer.alloc(0))).toBeNull();
  });
});

describe('fitWithin', () => {
  it('scales down preserving aspect ratio', () => {
    expect(fitWithin({ width: 300, height: 150 }, 200, 200)).toEqual({ width: 200, height: 100 });
    expect(fitWithin({ width: 100, height: 400 }, 200, 200)).toEqual({ width: 50, height: 200 });
  });

  it('never upscales an image smaller than the box', () => {
    expect(fitWithin({ width: 50, height: 20 }, 200, 200)).toEqual({ width: 50, height: 20 });
  });
});
