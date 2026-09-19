/**
 * Barcode/QR generation shared by any report renderer that needs to print a
 * scannable specimen/report identifier. `qrcode` was already a dependency
 * (used by the platform PDF generator's optional QR feature); `bwip-js` is
 * added here as the one new dependency — a pure-JS Code128 encoder with no
 * native/canvas requirement, so report generation stays usable in any
 * server environment.
 */

import bwipjs from 'bwip-js';
import QRCode from 'qrcode';

/** Renders a Code128 barcode for the given identifier as a PNG buffer. */
export async function generateBarcodePng(value: string): Promise<Buffer | null> {
  const text = value.trim();
  if (!text) return null;
  try {
    return await bwipjs.toBuffer({
      bcid: 'code128',
      text,
      scale: 3,
      height: 10,
      includetext: false,
      backgroundcolor: 'FFFFFF',
    });
  } catch {
    return null;
  }
}

/** Renders a QR code for the given payload (e.g. a verification URL) as a PNG buffer. */
export async function generateQrCodePng(value: string): Promise<Buffer | null> {
  const text = value.trim();
  if (!text) return null;
  try {
    return await QRCode.toBuffer(text, {
      type: 'png',
      margin: 1,
      scale: 4,
      errorCorrectionLevel: 'M',
    });
  } catch {
    return null;
  }
}
