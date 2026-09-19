/**
 * Minimal pixel-dimension reader for embedding images into generated
 * documents. docx.js (and PDF placement) need the source image's native
 * width/height up front to scale it into a print box without distorting
 * its aspect ratio — there is no dependency in this repo that already does
 * this, so it's a small header parser rather than a new package.
 */

export type ImageDimensions = { width: number; height: number };

function pngDimensions(buf: Buffer): ImageDimensions | null {
  if (buf.length < 24) return null;
  const isPng = buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a;
  if (!isPng) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function jpegDimensions(buf: Buffer): ImageDimensions | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 <= buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buf[offset + 1];
    // SOF0..SOF15 (excluding DHT/JPG/DAC markers) carry the frame dimensions.
    const isSof =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    const segmentLength = buf.readUInt16BE(offset + 2);
    if (isSof) {
      const height = buf.readUInt16BE(offset + 5);
      const width = buf.readUInt16BE(offset + 7);
      return { width, height };
    }
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    offset += 2 + segmentLength;
  }
  return null;
}

function gifDimensions(buf: Buffer): ImageDimensions | null {
  if (buf.length < 10) return null;
  const header = buf.toString('ascii', 0, 6);
  if (header !== 'GIF87a' && header !== 'GIF89a') return null;
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
}

function bmpDimensions(buf: Buffer): ImageDimensions | null {
  if (buf.length < 26 || buf[0] !== 0x42 || buf[1] !== 0x4d) return null;
  return { width: buf.readInt32LE(18), height: Math.abs(buf.readInt32LE(22)) };
}

function webpDimensions(buf: Buffer): ImageDimensions | null {
  if (buf.length < 30) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') {
    return null;
  }
  const format = buf.toString('ascii', 12, 16);
  if (format === 'VP8 ') {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (format === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (format === 'VP8X') {
    const width = (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1;
    const height = (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1;
    return { width, height };
  }
  return null;
}

/** Returns null (never throws) for corrupt/unrecognized data — callers must handle gracefully. */
export function getImageDimensions(buffer: Buffer): ImageDimensions | null {
  try {
    return (
      pngDimensions(buffer) ||
      jpegDimensions(buffer) ||
      gifDimensions(buffer) ||
      webpDimensions(buffer) ||
      bmpDimensions(buffer)
    );
  } catch {
    return null;
  }
}

/** Scale (width,height) to fit within a box, preserving aspect ratio, never upscaling. */
export function fitWithin(
  dims: ImageDimensions,
  maxWidth: number,
  maxHeight: number,
): ImageDimensions {
  const scale = Math.min(maxWidth / dims.width, maxHeight / dims.height, 1);
  return {
    width: Math.max(1, Math.round(dims.width * scale)),
    height: Math.max(1, Math.round(dims.height * scale)),
  };
}
