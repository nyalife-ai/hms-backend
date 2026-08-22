/**
 * Lab test types bulk importer — test name unique; category by name (created if needed via use-case).
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { HmsAuditWriter } from '../../audit/hms-audit.writer';
import { LabOperationsUseCase } from '../../laboratory/use-cases/lab-operations.usecase';
import type {
  BulkImportCommitResult,
  BulkImportNormalizedRow,
  BulkImportResource,
  BulkImportRowIssue,
  BulkImportValidateResult,
} from './bulk-import-resource';
import { cell, rowsToCsv } from './csv-utils';

const HEADERS = [
  'Test Name',
  'Category',
  'Description',
  'Standard Price',
] as const;

@Injectable()
export class LabTestTypesBulkImporter implements BulkImportResource {
  public readonly resourceKey = 'lab-test-types';
  public readonly displayName = 'Lab test types';
  public readonly headers = HEADERS;
  public readonly requiredHeaders = ['Test Name'] as const;

  private readonly logger = new Logger(LabTestTypesBulkImporter.name);

  public constructor(
    private readonly prisma: PrismaService,
    private readonly lab: LabOperationsUseCase,
    private readonly audit: HmsAuditWriter,
  ) {}

  public buildTemplateCsv(): string {
    return rowsToCsv(HEADERS, []);
  }

  public buildExampleCsv(): string {
    return rowsToCsv(HEADERS, [
      ['Complete Blood Count', 'Haematology', 'Full blood count panel', '1500'],
      ['Malaria Parasite', 'Parasitology', 'Blood smear for malaria', '800'],
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
      .map((r) => cell(r.values, 'Test Name'))
      .filter(Boolean);
    const existing = names.length
      ? await this.prisma.testTypes.findMany({
          where: {
            test_name: { in: [...new Set(names)], mode: 'insensitive' },
          },
          select: { test_name: true },
        })
      : [];
    const existingSet = new Set(
      existing.map((t) => t.test_name.toLowerCase()),
    );

    for (const raw of rawRows) {
      const rowNum = raw.index + 1;
      const rowErrors: BulkImportRowIssue[] = [];
      const testName = cell(raw.values, 'Test Name');
      const category = cell(raw.values, 'Category');
      const description = cell(raw.values, 'Description');
      const priceRaw = cell(raw.values, 'Standard Price');

      if (!testName) {
        rowErrors.push({
          row: rowNum,
          message: 'Test name is required.',
          field: 'Test Name',
        });
      } else if (testName.length > 255) {
        rowErrors.push({
          row: rowNum,
          message: 'Test name max length is 255.',
          field: 'Test Name',
        });
      } else if (seen.has(testName.toLowerCase())) {
        rowErrors.push({
          row: rowNum,
          message: `Test name is duplicated in this file (also on row ${seen.get(testName.toLowerCase())}).`,
          field: 'Test Name',
          value: testName,
        });
      } else if (existingSet.has(testName.toLowerCase())) {
        rowErrors.push({
          row: rowNum,
          message: `Test "${testName}" already exists.`,
          field: 'Test Name',
          value: testName,
        });
      } else {
        seen.set(testName.toLowerCase(), rowNum);
      }

      let standardPrice = '0';
      if (priceRaw) {
        const n = Number(priceRaw);
        if (Number.isNaN(n) || n < 0) {
          rowErrors.push({
            row: rowNum,
            message: 'Standard price must be a number ≥ 0.',
            field: 'Standard Price',
            value: priceRaw,
          });
        } else standardPrice = String(n);
      }

      if (rowErrors.length) {
        errors.push(...rowErrors);
        continue;
      }

      valid.push({
        testName,
        category: category || undefined,
        description: description || undefined,
        standardPrice,
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
        testName: r.testName,
        category: r.category,
        standardPrice: r.standardPrice,
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
        const created = await this.lab.createTestType({
          testName: row.testName!,
          category: row.category,
          description: row.description,
          standardPrice: Number(row.standardPrice ?? 0),
          actorUserId,
        });
        createdIds.push(created.id);
        imported += 1;
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        errors.push({
          row: rowNum,
          message: `Could not create test type: ${message}`,
          value: row.testName,
        });
        this.logger.warn(`Lab test type import row ${rowNum}: ${message}`);
      }
    }

    await this.audit.recordMutation({
      userId: actorUserId,
      action: 'CREATE',
      entityType: 'bulk-import.lab-test-types',
      entityId: createdIds[0] ?? 'none',
      newValues: { imported, failed, total: rows.length },
    });

    return { imported, failed, skipped: 0, errors, createdIds };
  }
}
