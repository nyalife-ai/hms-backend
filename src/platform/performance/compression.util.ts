import {
  brotliCompress,
  brotliDecompress,
  gzip,
  gunzip,
  InputType,
} from 'node:zlib';
import { promisify } from 'node:util';

export type CompressionAlgorithm = 'gzip' | 'br';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const brotliCompressAsync = promisify(brotliCompress);
const brotliDecompressAsync = promisify(brotliDecompress);

export async function compress(
  input: InputType,
  algorithm: CompressionAlgorithm,
): Promise<Buffer> {
  return algorithm === 'br' ? brotliCompressAsync(input) : gzipAsync(input);
}

export async function decompress(
  input: InputType,
  algorithm: CompressionAlgorithm,
): Promise<Buffer> {
  return algorithm === 'br' ? brotliDecompressAsync(input) : gunzipAsync(input);
}
