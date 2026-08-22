/**
 * Bed bulk importer — ward by name; bed number unique within ward.
 * No rooms (beds hang directly off wards).
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

const HEADERS = ['Ward Name', 'Bed Number'] as const;

@Injectable()
export class BedsBulkImporter implements BulkImportResource {
  public readonly resourceKey = 'beds';
  public readonly displayName = 'Beds';
  public readonly headers = HEADERS;
  public readonly requiredHeaders = ['Ward Name', 'Bed Number'] as const;

  private readonly logger = new Logger(BedsBulkImporter.name);

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
      ['General Ward A', 'A-01'],
      ['General Ward A', 'A-02'],
      ['ICU-1', 'ICU-01'],
    ]);
  }

  public async validate(
    rawRows: Array<{ index: number; values: Record<string, string> }>,
  ): Promise<BulkImportValidateResult> {
    const errors: BulkImportRowIssue[] = [];
    const warnings: BulkImportRowIssue[] = [];
    const valid: BulkImportNormalizedRow[] = [];
    const seen = new Map<string, number>();

    const wards = await this.prisma.wards.findMany({
      where: { is_active: true },
      select: { id: true, name: true },
    });
    const wardByName = new Map(wards.map((w) => [w.name.toLowerCase(), w]));

    const wardIds = wards.map((w) => w.id);
    const existingBeds =
      wardIds.length > 0
        ? await this.prisma.beds.findMany({
            where: { ward_id: { in: wardIds } },
            select: { ward_id: true, bed_number: true },
          })
        : [];
    const existingKeys = new Set(
      existingBeds.map(
        (b) => `${b.ward_id}:${b.bed_number.toLowerCase()}`,
      ),
    );

    for (const raw of rawRows) {
      const rowNum = raw.index + 1;
      const rowErrors: BulkImportRowIssue[] = [];
      const wardName = cell(raw.values, 'Ward Name');
      const bedNumber = cell(raw.values, 'Bed Number');

      if (!wardName) {
        rowErrors.push({
          row: rowNum,
          message: 'Ward name is required.',
          field: 'Ward Name',
        });
      }
      if (!bedNumber) {
        rowErrors.push({
          row: rowNum,
          message: 'Bed number is required.',
          field: 'Bed Number',
        });
      }

      const ward = wardName
        ? wardByName.get(wardName.toLowerCase())
        : undefined;
      if (wardName && !ward) {
        rowErrors.push({
          row: rowNum,
          message: `Ward "${wardName}" does not exist or is inactive.`,
          field: 'Ward Name',
          value: wardName,
        });
      }

      if (ward && bedNumber) {
        const fileKey = `${ward.id}:${bedNumber.toLowerCase()}`;
        if (seen.has(fileKey)) {
          rowErrors.push({
            row: rowNum,
            message: `Bed is duplicated in this file (also on row ${seen.get(fileKey)}).`,
            field: 'Bed Number',
            value: bedNumber,
          });
        } else if (existingKeys.has(fileKey)) {
          rowErrors.push({
            row: rowNum,
            message: `Bed "${bedNumber}" already exists in ward "${ward.name}".`,
            field: 'Bed Number',
            value: bedNumber,
          });
        } else {
          seen.set(fileKey, rowNum);
        }
      }

      if (rowErrors.length) {
        errors.push(...rowErrors);
        continue;
      }

      valid.push({
        wardId: ward!.id,
        wardName: ward!.name,
        bedNumber,
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
        wardName: r.wardName,
        bedNumber: r.bedNumber,
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
        const bed = await this.journey.createBed({
          wardId: row.wardId!,
          bedNumber: row.bedNumber!,
        });
        createdIds.push(bed.id);
        imported += 1;
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        errors.push({
          row: rowNum,
          message: `Could not create bed: ${message}`,
          value: `${row.wardName}/${row.bedNumber}`,
        });
        this.logger.warn(`Bed import row ${rowNum}: ${message}`);
      }
    }

    await this.audit.recordMutation({
      userId: actorUserId,
      action: 'CREATE',
      entityType: 'bulk-import.beds',
      entityId: createdIds[0] ?? 'none',
      newValues: { imported, failed, total: rows.length },
    });

    return { imported, failed, skipped: 0, errors, createdIds };
  }
}
