/**
 * generateReportPdf must reuse the exact same DOCX buffer that
 * generateReportDocx produces (converted, not re-rendered) — this is the
 * whole point of the design: PDF and DOCX can never visually diverge.
 */

import { LabOperationsUseCase } from '../use-cases/lab-operations.usecase';
import { convertDocxToPdf } from '../../../platform/documents/docx-to-pdf.util';

jest.mock('../../../platform/documents/docx-to-pdf.util', () => ({
  convertDocxToPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-fake')),
}));

describe('LabOperationsUseCase.generateReportPdf', () => {
  it('converts the exact docx buffer generateReportDocx produced', async () => {
    const ops = new LabOperationsUseCase({} as never, {} as never);
    const docxBuffer = Buffer.from('the-real-docx-bytes');
    jest.spyOn(ops, 'generateReportDocx').mockResolvedValue(docxBuffer);

    const result = await ops.generateReportPdf('req1');

    expect(ops.generateReportDocx).toHaveBeenCalledWith('req1');
    expect(convertDocxToPdf).toHaveBeenCalledWith(docxBuffer);
    expect(result.toString()).toBe('%PDF-fake');
  });
});
