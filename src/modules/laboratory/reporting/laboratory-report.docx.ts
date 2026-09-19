/**
 * Standard Clinical Laboratory Report — DOCX generator.
 *
 * Structural reference: a real-world multi-page clinical laboratory report
 * (structure only — no patient data, facility name, wording, or the
 * reference lab's own brand green/logo were copied) showing:
 *  - a top strip with the report title + page number, a "Sample Collected
 *    At" / "Processing Location" split, then a solid brand-color band with
 *    logo + QR + barcode;
 *  - a borderless two-column patient/laboratory-information block;
 *  - panels of analyte results laid out as an aligned borderless grid (not
 *    a bordered spreadsheet), with optional admin-configured subsection
 *    headings (e.g. "Erythrocytes") within a panel;
 *  - an inline Pathologist Remark row, a small-print methodology note, and
 *    a signature block;
 *  - true "Page X of Y" numbering repeated in the header on every page.
 *
 * Built directly on the `docx` package, mirroring
 * radiology/reporting/radiology-report.docx.ts's approach: the generic
 * platform/documents `DocumentGenerator` has no image, barcode, or custom
 * header/footer support.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import { buildImageAppendix } from '../../../platform/documents/image-appendix.util';
import { generateBarcodePng, generateQrCodePng } from '../../../platform/documents/identifier-codes.util';
import { fitWithin, getImageDimensions } from '../../../platform/documents/image-dimensions.util';
import type { LabAnalyteInterpretation, LaboratoryReportData } from './laboratory-report-data';

const BRAND_TEAL = '1AA8B0';
const GOLD_RULE = 'BFA130';
const TEXT_DARK = '1A1A1A';
const MUTED = '5A5A5A';
const ABNORMAL_COLOR = '1450A3'; // clinical convention (blue flag), not brand color
const WHITE = 'FFFFFF';

const LOGO_PATH = join(__dirname, 'assets', 'nyalife-logo.png');
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const;
const ALL_NONE = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
  insideHorizontal: NO_BORDER,
  insideVertical: NO_BORDER,
};

function dash(value: string | null | undefined): string {
  const v = value?.trim();
  return v ? v : '—';
}

function labelValue(label: string, value: string): Paragraph {
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: `${label} : `, bold: true, size: 18, color: TEXT_DARK }),
      new TextRun({ text: value, size: 18, color: TEXT_DARK }),
    ],
  });
}

function interpretationColor(interp: LabAnalyteInterpretation): string {
  return interp && interp !== 'NORMAL' ? ABNORMAL_COLOR : TEXT_DARK;
}

function subsectionHeadingRow(name: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        columnSpan: 4,
        borders: ALL_NONE,
        margins: { top: 100, bottom: 40, left: 40, right: 40 },
        children: [
          new Paragraph({
            children: [
              new TextRun({ text: name, bold: true, italics: true, underline: {}, size: 19, color: TEXT_DARK }),
            ],
          }),
        ],
      }),
    ],
  });
}

function analyteHeaderRow(): TableRow {
  const cell = (text: string, width: number) =>
    new TableCell({
      width: { size: width, type: WidthType.PERCENTAGE },
      borders: ALL_NONE,
      margins: { top: 40, bottom: 60, left: 40, right: 40 },
      children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 17, color: TEXT_DARK })] })],
    });
  return new TableRow({
    children: [
      cell('Investigation', 38),
      cell('Observed Value', 18),
      cell('Unit', 14),
      cell('Biological Reference Interval', 30),
    ],
  });
}

function analyteRow(a: LaboratoryReportData['panels'][number]['analytes'][number]): TableRow {
  const color = interpretationColor(a.interpretation);
  const abnormal = Boolean(a.interpretation && a.interpretation !== 'NORMAL');
  const cell = (children: TextRun[], width: number) =>
    new TableCell({
      width: { size: width, type: WidthType.PERCENTAGE },
      borders: ALL_NONE,
      verticalAlign: VerticalAlign.TOP,
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
      children: [new Paragraph({ children })],
    });
  return new TableRow({
    children: [
      cell([new TextRun({ text: a.parameterName, bold: true, size: 18, color: TEXT_DARK })], 38),
      cell([new TextRun({ text: dash(a.observedValue), bold: abnormal, color, size: 18 })], 18),
      cell([new TextRun({ text: dash(a.unit), size: 18, color: TEXT_DARK })], 14),
      cell([new TextRun({ text: dash(a.referenceRange), size: 18, color: TEXT_DARK })], 30),
    ],
  });
}

function pathologistRemarkRow(remark: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 38, type: WidthType.PERCENTAGE },
        borders: ALL_NONE,
        margins: { top: 100, bottom: 40, left: 40, right: 40 },
        children: [new Paragraph({ children: [new TextRun({ text: 'Pathologist Remark', bold: true, size: 18, color: TEXT_DARK })] })],
      }),
      new TableCell({
        columnSpan: 3,
        borders: ALL_NONE,
        margins: { top: 100, bottom: 40, left: 40, right: 40 },
        children: [new Paragraph({ children: [new TextRun({ text: remark, size: 18, color: TEXT_DARK })] })],
      }),
    ],
  });
}

function panelBlock(panel: LaboratoryReportData['panels'][number]): (Paragraph | Table)[] {
  const blocks: (Paragraph | Table)[] = [
    new Paragraph({
      spacing: { before: 200, after: 100 },
      children: [new TextRun({ text: panel.panelName, bold: true, size: 22, color: BRAND_TEAL })],
    }),
  ];
  if (!panel.analytes.length) {
    blocks.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: 'No results recorded for this panel.', italics: true, size: 18, color: MUTED })],
      }),
    );
    return blocks;
  }

  const rows: TableRow[] = [analyteHeaderRow()];
  let lastGroup: string | null | undefined = undefined;
  for (const a of panel.analytes) {
    if (a.groupName && a.groupName !== lastGroup) {
      rows.push(subsectionHeadingRow(a.groupName));
    }
    lastGroup = a.groupName ?? lastGroup;
    rows.push(analyteRow(a));
  }

  blocks.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: ALL_NONE, rows }));
  return blocks;
}

function infoColumnCell(paragraphs: Paragraph[]): TableCell {
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    borders: ALL_NONE,
    verticalAlign: VerticalAlign.TOP,
    margins: { top: 40, bottom: 40, left: 0, right: 100 },
    children: paragraphs,
  });
}

function thinRule(color: string): Paragraph {
  return new Paragraph({
    spacing: { before: 40, after: 40 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color, space: 2 } },
    children: [],
  });
}

function codeImageParagraph(
  png: Buffer | null,
  maxSize: number,
  alignment: (typeof AlignmentType)[keyof typeof AlignmentType],
): Paragraph {
  if (!png) return new Paragraph({ alignment, children: [] });
  const dims = getImageDimensions(png);
  const size = dims ? fitWithin(dims, maxSize, maxSize) : { width: maxSize, height: maxSize };
  return new Paragraph({ alignment, children: [new ImageRun({ type: 'png', data: png, transformation: size })] });
}

export async function generateLaboratoryReportDocx(data: LaboratoryReportData): Promise<Buffer> {
  const logoBuffer = readFileSync(LOGO_PATH);
  const [qrPng, barcodePng] = await Promise.all([
    generateQrCodePng(data.identifierValue),
    generateBarcodePng(data.identifierValue),
  ]);

  // Title line: empty spacer | centered title | right-aligned page number.
  // Fixed DXA widths (not PERCENTAGE) — a docx.js/LibreOffice quirk mis-sizes
  // percentage-only columns inside a header table, wrapping the title early.
  const titleRow = new Table({
    width: { size: 9026, type: WidthType.DXA },
    columnWidths: [300, 7626, 1100],
    borders: ALL_NONE,
    rows: [
      new TableRow({
        children: [
          new TableCell({ width: { size: 300, type: WidthType.DXA }, borders: ALL_NONE, children: [new Paragraph({ children: [] })] }),
          new TableCell({
            width: { size: 7626, type: WidthType.DXA },
            borders: ALL_NONE,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'MEDICAL LABORATORY REPORT', bold: true, size: 22, color: BRAND_TEAL })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 1100, type: WidthType.DXA },
            borders: ALL_NONE,
            verticalAlign: VerticalAlign.BOTTOM,
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: 'Page ', size: 14, color: MUTED }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 14, color: MUTED }),
                  new TextRun({ text: ' of ', size: 14, color: MUTED }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, color: MUTED }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const collectionRow = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: ALL_NONE,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            borders: ALL_NONE,
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Sample Collected At: ', bold: true, size: 14, color: TEXT_DARK }),
                  new TextRun({ text: data.facility.name, size: 14, color: TEXT_DARK }),
                ],
              }),
              new Paragraph({ children: [new TextRun({ text: data.facility.addressLine, size: 14, color: MUTED })] }),
            ],
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            borders: ALL_NONE,
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Processing Location : ', bold: true, size: 14, color: TEXT_DARK }),
                  new TextRun({ text: data.facility.name, size: 14, color: TEXT_DARK }),
                ],
              }),
              new Paragraph({ children: [new TextRun({ text: data.facility.addressLine, size: 14, color: MUTED })] }),
            ],
          }),
        ],
      }),
    ],
  });

  const band = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: ALL_NONE,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 45, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: BRAND_TEAL },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 80, bottom: 80, left: 120, right: 40 },
            children: [
              new Paragraph({
                children: [new ImageRun({ type: 'png', data: logoBuffer, transformation: { width: 140, height: 67 } })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 20, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: BRAND_TEAL },
            verticalAlign: VerticalAlign.CENTER,
            children: [codeImageParagraph(qrPng, 60, AlignmentType.CENTER)],
          }),
          new TableCell({
            width: { size: 35, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: BRAND_TEAL },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 80, bottom: 80, left: 40, right: 120 },
            children: [
              codeImageParagraph(barcodePng, 100, AlignmentType.RIGHT),
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { before: 20 },
                children: [new TextRun({ text: data.identifierValue, size: 16, color: WHITE, bold: true })],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const header = new Header({ children: [titleRow, collectionRow, thinRule('CCCCCC'), band, thinRule(GOLD_RULE)] });

  const footer = new Footer({
    children: [
      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 4 } },
        spacing: { before: 40 },
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: data.facility.addressLine, size: 14, color: MUTED }),
          new TextRun({ text: '   ·   ', size: 14, color: MUTED }),
          new TextRun({ text: data.facility.contactLine, size: 14, color: MUTED }),
        ],
      }),
    ],
  });

  const patientColumn = [
    labelValue('Name', data.patient.name),
    labelValue('Age / Gender', `${data.patient.age} / ${data.patient.sex}`),
    labelValue('Contact No.', dash(data.patient.phone)),
    labelValue('Address', dash(data.patient.address)),
    labelValue('Pincode', dash(data.patient.pincode)),
  ];
  const labColumn = [
    labelValue('VID No.', data.request.requestNumber),
    labelValue('PID No.', data.patientIdentifier),
    labelValue('Referred by', dash(data.referringProvider.name)),
    labelValue('Registered On', data.registration.registeredOn),
    labelValue('Collected On', dash(data.collection.collectedOn)),
    labelValue('Reported On', data.reporting.reportedOn),
  ];

  const body: (Paragraph | Table)[] = [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: ALL_NONE,
      rows: [new TableRow({ children: [infoColumnCell(patientColumn), infoColumnCell(labColumn)] })],
    }),
    thinRule(GOLD_RULE),
  ];

  data.panels.forEach((panel, i) => {
    body.push(...panelBlock(panel));
    if (i === data.panels.length - 1 && data.pathologistRemark) {
      body.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: ALL_NONE,
          rows: [pathologistRemarkRow(data.pathologistRemark)],
        }),
      );
    }
  });

  if (data.methodologyNote) {
    body.push(
      new Paragraph({
        spacing: { before: 200, after: 40 },
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 4 } },
        children: [new TextRun({ text: data.methodologyNote, size: 14, color: MUTED })],
      }),
    );
  }

  body.push(new Paragraph({ spacing: { before: 400 }, children: [] }));
  if (data.verifier.name) {
    body.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 20 },
        children: [new TextRun({ text: data.verifier.name, bold: true, size: 20, color: TEXT_DARK })],
      }),
    );
    if (data.verifier.qualification) {
      body.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: data.verifier.qualification, size: 16, color: MUTED })],
        }),
      );
    }
  }

  const appendix = buildImageAppendix('ATTACHED CLINICAL IMAGES', data.attachments);
  if (appendix.length) {
    body.push(new Paragraph({ children: [new PageBreak()] }));
    body.push(...appendix);
  }

  const doc = new Document({
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 } } }, // A4
        headers: { default: header },
        footers: { default: footer },
        children: body,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
