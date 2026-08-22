/**
 * Ward bulk importer — name unique; ward type enum; department by name/code.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { HmsAuditWriter } from '../../audit/hms-audit.writer';
import { IpdJourneyUseCase } from '../../inpatient/use-cases/ipd-journey.usecase';
import type {
  BulkImportCommitResult,
  BulkImportNormalizedRow,
  BulkImportResource,
  BulkImportRowIssue,
  BulkImportValidateResult,
} from './bulk-import-resource';
import { cell, rowsToCsv } from './csv-utils';

const HEADERS = [
  'Ward Name',
  'Ward Type',
  'Department Code',
  'Department Name',
  'Daily Rate',
  'Capacity',
] as const;

const WARD_TYPES = [
  'GENERAL',
  'ICU',
  'NICU',
  'MATERNITY',
  'PEDIATRIC',
  'PRIVATE',
  'SEMI_PRIVATE',
] as const;

@Injectable()
export class WardsBulkImporter implements BulkImportResource {
  public readonly resourceKey = 'wards';
  public readonly displayName = 'Wards';
  public readonly headers = HEADERS;
  public readonly requiredHeaders = ['Ward Name'] as const;

  private readonly logger = new Logger(WardsBulkImporter.name);

  public constructor(
    private readonly prisma: PrismaService,
    private readonly journey: IpdJourneyUseCase,
    private readonly audit: HmsAuditWriter,
  ) {}

  public buildTemplateCsv(): string {
    return rowsToCsv(HEADERS, []);
  }

  public buildExampleCsv(): string {
    return rowsToCsv(HEADERS, [
      ['General Ward A', 'GENERAL', '', 'Outpatient', '2500', '20'],
      ['ICU-1', 'ICU', '', '', '8000', '6'],
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
      .map((r) => cell(r.values, 'Ward Name'))
      .filter(Boolean);
    const existing = names.length
      ? await this.prisma.wards.findMany({
          where: {
            name: { in: [...new Set(names)], mode: 'insensitive' },
          },
          select: { name: true },
        })
      : [];
    const existingSet = new Set(existing.map((w) => w.name.toLowerCase()));

    const depts = await this.prisma.departments.findMany({
      where: { is_active: true },
      select: { id: true, name: true, code: true },
    });
    const byCode = new Map(depts.map((d) => [d.code.toUpperCase(), d]));
    const byName = new Map(depts.map((d) => [d.name.toLowerCase(), d]));

    for (const raw of rawRows) {
      const rowNum = raw.index + 1;
      const rowErrors: BulkImportRowIssue[] = [];
      const name = cell(raw.values, 'Ward Name');
      const wardType = (
        cell(raw.values, 'Ward Type') || 'GENERAL'
      ).toUpperCase();
      const deptCode = cell(raw.values, 'Department Code').toUpperCase();
      const deptName = cell(raw.values, 'Department Name');
      const dailyRateRaw = cell(raw.values, 'Daily Rate');
      const capacityRaw = cell(raw.values, 'Capacity');

      if (!name) {
        rowErrors.push({
          row: rowNum,
          message: 'Ward name is required.',
          field: 'Ward Name',
        });
      } else if (seen.has(name.toLowerCase())) {
        rowErrors.push({
          row: rowNum,
          message: `Ward name is duplicated in this file (also on row ${seen.get(name.toLowerCase())}).`,
          field: 'Ward Name',
          value: name,
        });
      } else if (existingSet.has(name.toLowerCase())) {
        rowErrors.push({
          row: rowNum,
          message: `Ward "${name}" already exists.`,
          field: 'Ward Name',
          value: name,
        });
      } else {
        seen.set(name.toLowerCase(), rowNum);
      }

      if (!(WARD_TYPES as readonly string[]).includes(wardType)) {
        rowErrors.push({
          row: rowNum,
          message: `Ward type must be one of: ${WARD_TYPES.join(', ')}.`,
          field: 'Ward Type',
          value: wardType,
        });
      }

      let departmentId: string | undefined;
      if (deptCode) {
        const d = byCode.get(deptCode);
        if (!d) {
          rowErrors.push({
            row: rowNum,
            message: `Department code "${deptCode}" does not exist.`,
            field: 'Department Code',
            value: deptCode,
          });
        } else departmentId = d.id;
      } else if (deptName) {
        const d = byName.get(deptName.toLowerCase());
        if (!d) {
          rowErrors.push({
            row: rowNum,
            message: `Department "${deptName}" does not exist.`,
            field: 'Department Name',
            value: deptName,
          });
        } else departmentId = d.id;
      }

      let dailyRate = '0';
      if (dailyRateRaw) {
        const n = Number(dailyRateRaw);
        if (Number.isNaN(n) || n < 0) {
          rowErrors.push({
            row: rowNum,
            message: 'Daily rate must be a number ≥ 0.',
            field: 'Daily Rate',
            value: dailyRateRaw,
          });
        } else dailyRate = String(n);
      }

      let capacity = '0';
      if (capacityRaw) {
        const n = Number(capacityRaw);
        if (!Number.isInteger(n) || n < 0) {
          rowErrors.push({
            row: rowNum,
            message: 'Capacity must be a whole number ≥ 0.',
            field: 'Capacity',
            value: capacityRaw,
          });
        } else capacity = String(n);
      }

      if (rowErrors.length) {
        errors.push(...rowErrors);
        continue;
      }

      valid.push({
        name,
        wardType,
        departmentId,
        dailyRate,
        capacity,
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
        name: r.name,
        wardType: r.wardType,
        dailyRate: r.dailyRate,
        capacity: r.capacity,
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
        const ward = await this.journey.createWard({
          name: row.name!,
          wardType: row.wardType,
          departmentId: row.departmentId,
          dailyRate: Number(row.dailyRate ?? 0),
          capacity: Number(row.capacity ?? 0),
        });
        createdIds.push(ward.id);
        imported += 1;
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        errors.push({
          row: rowNum,
          message: `Could not create ward: ${message}`,
          value: row.name,
        });
        this.logger.warn(`Ward import row ${rowNum}: ${message}`);
      }
    }

    await this.audit.recordMutation({
      userId: actorUserId,
      action: 'CREATE',
      entityType: 'bulk-import.wards',
      entityId: createdIds[0] ?? 'none',
      newValues: { imported, failed, total: rows.length },
    });

    return { imported, failed, skipped: 0, errors, createdIds };
  }
}
