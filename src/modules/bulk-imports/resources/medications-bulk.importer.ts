/**
 * Medications bulk importer — medication name unique; category by name.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { HmsAuditWriter } from '../../audit/hms-audit.writer';
import { PharmacyOperationsUseCase } from '../../pharmacy/use-cases/pharmacy-operations.usecase';
import type {
  BulkImportCommitResult,
  BulkImportNormalizedRow,
  BulkImportResource,
  BulkImportRowIssue,
  BulkImportValidateResult,
} from './bulk-import-resource';
import { cell, rowsToCsv } from './csv-utils';

const HEADERS = [
  'Medication Name',
  'Generic Name',
  'Category',
  'Form',
  'Strength',
  'Unit',
  'Standard Selling Price',
  'Description',
] as const;

const MED_FORMS = [
  'TABLET',
  'CAPSULE',
  'SYRUP',
  'INJECTION',
  'CREAM',
  'OTHER',
] as const;

@Injectable()
export class MedicationsBulkImporter implements BulkImportResource {
  public readonly resourceKey = 'medications';
  public readonly displayName = 'Medications';
  public readonly headers = HEADERS;
  public readonly requiredHeaders = ['Medication Name'] as const;

  private readonly logger = new Logger(MedicationsBulkImporter.name);

  public constructor(
    private readonly prisma: PrismaService,
    private readonly pharmacy: PharmacyOperationsUseCase,
    private readonly audit: HmsAuditWriter,
  ) {}

  public buildTemplateCsv(): string {
    return rowsToCsv(HEADERS, []);
  }

  public buildExampleCsv(): string {
    return rowsToCsv(HEADERS, [
      [
        'Amoxicillin 500mg',
        'Amoxicillin',
        'Antibiotics',
        'CAPSULE',
        '500mg',
        'capsule',
        '25',
        '',
      ],
      [
        'Paracetamol 500mg',
        'Paracetamol',
        'Analgesics',
        'TABLET',
        '500mg',
        'tablet',
        '5',
        '',
      ],
    ]);
  }

  public async validate(
    rawRows: Array<{ index: number; values: Record<string, string> }>,
  ): Promise<BulkImportValidateResult> {
    const errors: BulkImportRowIssue[] = [];
    const warnings: BulkImportRowIssue[] = [];
    const valid: BulkImportNormalizedRow[] = [];
    const seen = new Map<string, number>();

    const names = rawRows
      .map((r) => cell(r.values, 'Medication Name'))
      .filter(Boolean);
    const existing = names.length
      ? await this.prisma.medications.findMany({
          where: {
            medication_name: {
              in: [...new Set(names)],
              mode: 'insensitive',
            },
          },
          select: { medication_name: true },
        })
      : [];
    const existingSet = new Set(
      existing.map((m) => m.medication_name.toLowerCase()),
    );

    const categories = await this.prisma.categories.findMany({
      select: { id: true, category_name: true },
    });
    const catByName = new Map(
      categories.map((c) => [c.category_name.toLowerCase(), c]),
    );

    for (const raw of rawRows) {
      const rowNum = raw.index + 1;
      const rowErrors: BulkImportRowIssue[] = [];
      const medicationName = cell(raw.values, 'Medication Name');
      const genericName = cell(raw.values, 'Generic Name');
      const category = cell(raw.values, 'Category');
      const form = cell(raw.values, 'Form').toUpperCase();
      const strength = cell(raw.values, 'Strength');
      const unit = cell(raw.values, 'Unit');
      const priceRaw = cell(raw.values, 'Standard Selling Price');
      const description = cell(raw.values, 'Description');

      if (!medicationName) {
        rowErrors.push({
          row: rowNum,
          message: 'Medication name is required.',
          field: 'Medication Name',
        });
      } else if (seen.has(medicationName.toLowerCase())) {
        rowErrors.push({
          row: rowNum,
          message: `Medication name is duplicated in this file (also on row ${seen.get(medicationName.toLowerCase())}).`,
          field: 'Medication Name',
          value: medicationName,
        });
      } else if (existingSet.has(medicationName.toLowerCase())) {
        rowErrors.push({
          row: rowNum,
          message: `Medication "${medicationName}" already exists.`,
          field: 'Medication Name',
          value: medicationName,
        });
      } else {
        seen.set(medicationName.toLowerCase(), rowNum);
      }

      if (form && !(MED_FORMS as readonly string[]).includes(form)) {
        rowErrors.push({
          row: rowNum,
          message: `Form must be one of: ${MED_FORMS.join(', ')}.`,
          field: 'Form',
          value: form,
        });
      }

      let categoryId: string | undefined;
      if (category) {
        const cat = catByName.get(category.toLowerCase());
        if (!cat) {
          rowErrors.push({
            row: rowNum,
            message: `Category "${category}" does not exist. Create it first.`,
            field: 'Category',
            value: category,
          });
        } else categoryId = cat.id;
      }

      let standardSellingPrice = '0';
      if (priceRaw) {
        const n = Number(priceRaw);
        if (Number.isNaN(n) || n < 0) {
          rowErrors.push({
            row: rowNum,
            message: 'Standard selling price must be a number ≥ 0.',
            field: 'Standard Selling Price',
            value: priceRaw,
          });
        } else standardSellingPrice = String(n);
      }

      if (rowErrors.length) {
        errors.push(...rowErrors);
        continue;
      }

      valid.push({
        medicationName,
        genericName: genericName || undefined,
        categoryId,
        form: form || undefined,
        strength: strength || undefined,
        unit: unit || undefined,
        standardSellingPrice,
        description: description || undefined,
        _row: String(rowNum),
      });
    }

    return {
      totalRows: rawRows.length,
      validRows: valid.length,
      invalidRows: rawRows.length - valid.length,
      warningRows: 0,
      errors,
      warnings,
      rows: valid,
      previewSample: valid.slice(0, 5).map((r) => ({
        medicationName: r.medicationName,
        form: r.form,
        standardSellingPrice: r.standardSellingPrice,
      })),
    };
  }

  public async commit(
    rows: BulkImportNormalizedRow[],
    actorUserId: string,
  ): Promise<BulkImportCommitResult> {
    const errors: BulkImportRowIssue[] = [];
    const createdIds: string[] = [];
    let imported = 0;
    let failed = 0;

    for (const row of rows) {
      const rowNum = Number(row._row ?? 0);
      try {
        const created = await this.pharmacy.createMedication({
          medicationName: row.medicationName!,
          genericName: row.genericName,
          categoryId: row.categoryId,
          form: row.form,
          strength: row.strength,
          unit: row.unit,
          standardSellingPrice: Number(row.standardSellingPrice ?? 0),
          description: row.description,
          actorUserId,
        });
        createdIds.push(created.id);
        imported += 1;
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        errors.push({
          row: rowNum,
          message: `Could not create medication: ${message}`,
          value: row.medicationName,
        });
        this.logger.warn(`Medication import row ${rowNum}: ${message}`);
      }
    }

    await this.audit.recordMutation({
      userId: actorUserId,
      action: 'CREATE',
      entityType: 'bulk-import.medications',
      entityId: createdIds[0] ?? 'none',
      newValues: { imported, failed, total: rows.length },
    });

    return { imported, failed, skipped: 0, errors, createdIds };
  }
}
