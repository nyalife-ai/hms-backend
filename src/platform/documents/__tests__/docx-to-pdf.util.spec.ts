import { Document, Packer, Paragraph, TextRun } from 'docx';
import { convertDocxToPdf } from '../docx-to-pdf.util';

async function tinyDocx(): Promise<Buffer> {
  const doc = new Document({
    sections: [{ children: [new Paragraph({ children: [new TextRun('Hello world')] })] }],
  });
  return Packer.toBuffer(doc);
}

describe('convertDocxToPdf', () => {
  it('converts a real docx buffer into a valid PDF', async () => {
    const docx = await tinyDocx();
    const pdf = await convertDocxToPdf(docx);
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  }, 20000);
});
