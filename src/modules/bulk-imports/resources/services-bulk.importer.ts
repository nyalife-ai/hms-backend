/**
 * Billing services bulk importer — service code unique.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { HmsAuditWriter } from '../../audit/hms-audit.writer';
import { BillingFinanceService } from '../../billing/billing-finance.service';
import type {
  BulkImportCommitResult,
  BulkImportNormalizedRow,
  BulkImportResource,
  BulkImportRowIssue,
  BulkImportValidateResult,
} from './bulk-import-resource';
import { cell, rowsToCsv } from './csv-utils';

const HEADERS = [
  'Service Code',
  'Service Name',
  'Category',
  'Description',
  'Standard Price',
] as const;

@Injectable()
export class ServicesBulkImporter implements BulkImportResource {
  public readonly resourceKey = 'services';
  public readonly displayName = 'Services';
  public readonly headers = HEADERS;
  public readonly requiredHeaders = [
    'Service Code',
    'Service Name',
    'Standard Price',
  ] as const;

  private readonly logger = new Logger(ServicesBulkImporter.name);

  public constructor(
    private readonly prisma: PrismaService,
    private readonly finance: BillingFinanceService,
    private readonly audit: HmsAuditWriter,
  ) {}

  public buildTemplateCsv(): string {
    return rowsToCsv(HEADERS, []);
  }

  public buildExampleCsv(): string {
    return rowsToCsv(HEADERS, [
      ['CONS-GP', 'General Consultation', 'Consultation', '', '1500'],
      ['PROC-INJ', 'Injection Fee', 'Procedure', 'IM/IV injection', '500'],
    ]);
  }

  public async validate(
    rawRows: Array<{ index: number; values: Record<string, string> }>,
  ): Promise<BulkImportValidateResult> {
    const errors: BulkImportRowIssue[] = [];
    const warnings: BulkImportRowIssue[] = [];
    const valid: BulkImportNormalizedRow[] = [];
    const seen = new Map<string, number>();

    const codes = rawRows
      .map((r) => cell(r.values, 'Service Code'))
      .filter(Boolean);
    const existing = codes.length
      ? await this.prisma.services.findMany({
          where: {
            service_code: { in: [...new Set(codes)], mode: 'insensitive' },
          },
          select: { service_code: true },
        })
      : [];
    const existingSet = new Set(
      existing.map((s) => s.service_code.toLowerCase()),
    );

    for (const raw of rawRows) {
      const rowNum = raw.index + 1;
      const rowErrors: BulkImportRowIssue[] = [];
      const serviceCode = cell(raw.values, 'Service Code');
      const serviceName = cell(raw.values, 'Service Name');
      const category = cell(raw.values, 'Category');
      const description = cell(raw.values, 'Description');
      const priceRaw = cell(raw.values, 'Standard Price');

      if (!serviceCode) {
        rowErrors.push({
          row: rowNum,
          message: 'Service code is required.',
          field: 'Service Code',
        });
      } else if (seen.has(serviceCode.toLowerCase())) {
        rowErrors.push({
          row: rowNum,
          message: `Service code is duplicated in this file (also on row ${seen.get(serviceCode.toLowerCase())}).`,
          field: 'Service Code',
          value: serviceCode,
        });
      } else if (existingSet.has(serviceCode.toLowerCase())) {
        rowErrors.push({
          row: rowNum,
          message: `Service code "${serviceCode}" already exists.`,
          field: 'Service Code',
          value: serviceCode,
        });
      } else {
        seen.set(serviceCode.toLowerCase(), rowNum);
      }

      if (!serviceName) {
        rowErrors.push({
          row: rowNum,
          message: 'Service name is required.',
          field: 'Service Name',
        });
      }

      if (!priceRaw) {
        rowErrors.push({
          row: rowNum,
          message: 'Standard price is required.',
          field: 'Standard Price',
        });
      } else {
        const n = Number(priceRaw);
        if (Number.isNaN(n) || n < 0) {
          rowErrors.push({
            row: rowNum,
            message: 'Standard price must be a number ≥ 0.',
            field: 'Standard Price',
            value: priceRaw,
          });
        }
      }

      if (rowErrors.length) {
        errors.push(...rowErrors);
        continue;
      }

      valid.push({
        serviceCode,
        serviceName,
        category: category || undefined,
        description: description || undefined,
        standardPrice: priceRaw,
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
        serviceCode: r.serviceCode,
        serviceName: r.serviceName,
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
        const created = await this.finance.createService({
          serviceCode: row.serviceCode!,
          serviceName: row.serviceName!,
          category: row.category,
          description: row.description,
          standardPrice: row.standardPrice!,
          actorUserId,
        });
        createdIds.push(created.id);
        imported += 1;
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        errors.push({
          row: rowNum,
          message: `Could not create service: ${message}`,
          value: row.serviceCode,
        });
        this.logger.warn(`Service import row ${rowNum}: ${message}`);
      }
    }

    await this.audit.recordMutation({
      userId: actorUserId,
      action: 'CREATE',
      entityType: 'bulk-import.services',
      entityId: createdIds[0] ?? 'none',
      newValues: { imported, failed, total: rows.length },
    });

    return { imported, failed, skipped: 0, errors, createdIds };
  }
}
