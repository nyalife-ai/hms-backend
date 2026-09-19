/**
 * Server-side DOCX → PDF conversion via headless LibreOffice.
 *
 * This exists so a report's PDF and DOCX outputs can never visually diverge:
 * both formats are produced from the exact same generated document buffer,
 * with LibreOffice doing the rasterization rather than a second,
 * independently-maintained PDF renderer. Requires the `soffice` binary to be
 * present on the host (LibreOffice) — a real deployment dependency, not an
 * npm package; see the module README/deploy notes.
 */

import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { ServiceUnavailableException } from '@nestjs/common';

const CONVERT_TIMEOUT_MS = 30_000;

export async function convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
  const workDir = join(tmpdir(), `docx2pdf-${randomUUID()}`);
  await fs.mkdir(workDir, { recursive: true });
  const inputPath = join(workDir, 'report.docx');
  const outputPath = join(workDir, 'report.pdf');

  try {
    await fs.writeFile(inputPath, docxBuffer);
    await new Promise<void>((resolve, reject) => {
      execFile(
        'soffice',
        ['--headless', '--convert-to', 'pdf', '--outdir', workDir, inputPath],
        { timeout: CONVERT_TIMEOUT_MS },
        (error, _stdout, stderr) => {
          if (error) {
            reject(
              new ServiceUnavailableException(
                `PDF conversion is unavailable on this server (LibreOffice/soffice not installed or failed): ${stderr || error.message}`,
              ),
            );
            return;
          }
          resolve();
        },
      );
    });
    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
