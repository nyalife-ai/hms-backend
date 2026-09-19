import { generateBarcodePng, generateQrCodePng } from '../identifier-codes.util';
import { getImageDimensions } from '../image-dimensions.util';

describe('generateBarcodePng', () => {
  it('renders a Code128 PNG for a given identifier', async () => {
    const png = await generateBarcodePng('LAB-2026-000123');
    expect(png).not.toBeNull();
    const dims = getImageDimensions(png!);
    expect(dims).not.toBeNull();
    expect(dims!.width).toBeGreaterThan(0);
    expect(dims!.height).toBeGreaterThan(0);
  });

  it('returns null for an empty identifier rather than throwing', async () => {
    expect(await generateBarcodePng('')).toBeNull();
    expect(await generateBarcodePng('   ')).toBeNull();
  });
});

describe('generateQrCodePng', () => {
  it('renders a QR PNG for a given payload', async () => {
    const png = await generateQrCodePng('https://example.invalid/verify?ref=LAB-2026-000123');
    expect(png).not.toBeNull();
    const dims = getImageDimensions(png!);
    expect(dims).toEqual({ width: dims!.height, height: dims!.height }); // QR codes are square
  });

  it('returns null for an empty payload rather than throwing', async () => {
    expect(await generateQrCodePng('')).toBeNull();
  });
});
