/**
 * Professional radiology report DOCX generator. Layout is modeled on five
 * inspected legacy NyaLife reports (structure only — no patient data or
 * legacy text was copied): branded header with logo + address + contact +
 * teal rule, a patient/study info table, bold section headings, narrative
 * findings/impression, a structured-measurements table when the report used
 * a template, a signature block, and a branded footer.
 *
 * Implements the same {format, generate(options)} shape as
 * platform/documents' DocumentGenerator<T> contract, but is NOT built on
 * that platform's generic DocumentContent model — that model has no image
 * or custom header/footer support, which a professional clinical report
 * with a logo and signature block genuinely needs.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  PageBreak,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import { buildImageAppendix, type ReportAttachment } from '../../../platform/documents/image-appendix.util';
import { BULLET_REF, htmlToParagraphs, NUMBER_REF } from './html-to-docx';

const BRAND_PINK = 'F02878';
const BRAND_TEAL = '1AA8B0';
const TEXT_DARK = '222222';
const MUTED = '555555';

const LOGO_PATH = join(__dirname, 'assets', 'nyalife-logo.png');

export type ReportTemplateSection = {
  key: string;
  label: string;
  type: string;
};

export type RadiologyReportDocxOptions = {
  facility: {
    name: string;
    addressLine: string;
    contactLine: string;
  };
  patient: {
    name: string;
    patientNumber: string;
    age: string;
    sex: string;
  };
  visit: {
    date: string;
    visitId: string;
  };
  study: {
    description: string;
    clinicalHistory?: string | null;
  };
  findingsHtml?: string | null;
  report: {
    version: number;
    status: string;
    sectionsData?: Record<string, unknown> | null;
    templateSections?: ReportTemplateSection[];
    finalImpressionHtml?: string | null;
    conclusion?: string | null;
    recommendations?: string | null;
    signedAt?: string | null;
  };
  clinicians: {
    sonographerName?: string | null;
    sonographerTitle?: string | null;
    referringDoctorName?: string | null;
    referringDoctorTitle?: string | null;
  };
  attachments?: ReportAttachment[];
};

function heading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 80 },
    children: [
      new TextRun({ text, bold: true, underline: {}, color: TEXT_DARK, size: 22 }),
    ],
  });
}

function bodyParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, size: 22, color: TEXT_DARK })],
  });
}

function infoCell(label: string, value: string, opts?: { shaded?: boolean }): TableCell {
  return new TableCell({
    width: { size: 25, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.CENTER,
    shading: opts?.shaded
      ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F5F5F5' }
      : undefined,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [
      new Paragraph({
        children: [new TextRun({ text: label, bold: true, size: 18, color: TEXT_DARK })],
      }),
    ],
  });
}

function valueCell(value: string): TableCell {
  return new TableCell({
    width: { size: 25, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [new Paragraph({ children: [new TextRun({ text: value || '—', size: 18 })] })],
  });
}

function infoRow(labelA: string, valueA: string, labelB: string, valueB: string): TableRow {
  return new TableRow({
    children: [infoCell(labelA, valueA, { shaded: true }), valueCell(valueA), infoCell(labelB, valueB, { shaded: true }), valueCell(valueB)],
  });
}

function tealRule(): Paragraph {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: BRAND_TEAL, space: 4 } },
    children: [],
  });
}

function buildStructuredSectionsTable(
  sections: ReportTemplateSection[],
  data: Record<string, unknown>,
): Table | null {
  const rows = sections
    .map((s) => ({ label: s.label, value: data[s.key] }))
    .filter((r) => r.value !== undefined && r.value !== null && String(r.value).trim() !== '');
  if (!rows.length) return null;
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [3500, 6000],
    rows: rows.map(
      (r) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 3500, type: WidthType.DXA },
              shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F5F5F5' },
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
              children: [new Paragraph({ children: [new TextRun({ text: r.label, bold: true, size: 18 })] })],
            }),
            new TableCell({
              width: { size: 6000, type: WidthType.DXA },
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
              children: [new Paragraph({ children: [new TextRun({ text: String(r.value), size: 18 })] })],
            }),
          ],
        }),
    ),
  });
}

export async function generateRadiologyReportDocx(
  options: RadiologyReportDocxOptions,
): Promise<Buffer> {
  const logoBuffer = readFileSync(LOGO_PATH);

  const header = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            type: 'png',
            data: logoBuffer,
            transformation: { width: 170, height: 82 },
          }),
        ],
      }),
      new Paragraph({
        children: [new TextRun({ text: options.facility.addressLine, size: 16, color: MUTED })],
      }),
      new Paragraph({
        children: [new TextRun({ text: options.facility.contactLine, size: 16, color: MUTED })],
      }),
      tealRule(),
    ],
  });

  const footer = new Footer({
    children: [
      tealRule(),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'We offer Personalized Healthcare', size: 16, color: BRAND_TEAL, bold: true })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: `For enquiries, contact us on ${options.facility.contactLine}`,
            size: 16,
            color: BRAND_TEAL,
          }),
        ],
      }),
    ],
  });

  const infoTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
      left: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
      right: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
    },
    rows: [
      infoRow('PATIENT NAME', options.patient.name, 'PATIENT NUMBER', options.patient.patientNumber),
      infoRow('AGE', options.patient.age, 'SEX', options.patient.sex),
      infoRow('DATE', options.visit.date, 'VISIT ID', options.visit.visitId),
      infoRow('STUDY DESCRIPTION', options.study.description, 'CLINICAL HISTORY', options.study.clinicalHistory || '—'),
    ],
  });

  const body: (Paragraph | Table)[] = [
    new Paragraph({
      spacing: { before: 200, after: 160 },
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      children: [
        new TextRun({ text: options.study.description.toUpperCase(), bold: true, color: BRAND_PINK, size: 26 }),
      ],
    }),
    infoTable,
    new Paragraph({ spacing: { before: 200 }, children: [] }),
  ];

  if (options.findingsHtml) {
    body.push(heading('Findings'));
    body.push(...htmlToParagraphs(options.findingsHtml));
  }

  const structuredTable =
    options.report.templateSections?.length && options.report.sectionsData
      ? buildStructuredSectionsTable(options.report.templateSections, options.report.sectionsData)
      : null;
  if (structuredTable) {
    body.push(heading('Measurements'));
    body.push(structuredTable);
    body.push(new Paragraph({ spacing: { before: 120 }, children: [] }));
  }

  if (options.report.finalImpressionHtml) {
    body.push(heading('Impression'));
    body.push(...htmlToParagraphs(options.report.finalImpressionHtml));
  }
  if (options.report.conclusion) {
    body.push(heading('Conclusion'));
    body.push(bodyParagraph(options.report.conclusion));
  }
  if (options.report.recommendations) {
    body.push(heading('Recommendations'));
    body.push(bodyParagraph(options.report.recommendations));
  }

  if (options.report.status === 'AMENDED') {
    body.push(
      new Paragraph({
        spacing: { before: 160 },
        children: [
          new TextRun({
            text: `This report was amended (version ${options.report.version}).`,
            italics: true,
            color: MUTED,
            size: 18,
          }),
        ],
      }),
    );
  }

  body.push(new Paragraph({ spacing: { before: 320 }, children: [] }));
  if (options.clinicians.sonographerName) {
    body.push(
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '333333', space: 2 } },
        spacing: { after: 40 },
        children: [
          new TextRun({
            text: `${options.clinicians.sonographerName}${options.clinicians.sonographerTitle ? ` (${options.clinicians.sonographerTitle})` : ''}`,
            bold: true,
            italics: true,
            size: 20,
          }),
        ],
      }),
    );
  }
  if (options.clinicians.referringDoctorName) {
    body.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `For ${options.clinicians.referringDoctorName}${
              options.clinicians.referringDoctorTitle ? ` - ${options.clinicians.referringDoctorTitle}` : ''
            }`,
            italics: true,
            size: 20,
          }),
        ],
      }),
    );
  }

  const appendix = buildImageAppendix('RADIOLOGY IMAGES', options.attachments ?? []);
  if (appendix.length) {
    body.push(new Paragraph({ children: [new PageBreak()] }));
    body.push(...appendix);
  }

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: BULLET_REF,
          levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT }],
        },
        {
          reference: NUMBER_REF,
          levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT }],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: { size: { width: 12240, height: 15840 } },
        },
        headers: { default: header },
        footers: { default: footer },
        children: body,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
