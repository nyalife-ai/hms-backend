/**
 * Suppliers bulk importer — company name treated as natural key (no DB unique).
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
import { isValidEmail, isValidPhone } from './patient-csv.contract';

const HEADERS = [
  'Company Name',
  'Contact Person',
  'Phone',
  'Email',
  'Address',
] as const;

@Injectable()
export class SuppliersBulkImporter implements BulkImportResource {
  public readonly resourceKey = 'suppliers';
  public readonly displayName = 'Suppliers';
  public readonly headers = HEADERS;
  public readonly requiredHeaders = ['Company Name'] as const;

  private readonly logger = new Logger(SuppliersBulkImporter.name);

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
        'MedSupply Kenya Ltd',
        'Jane Wanjiru',
        '+254722000111',
        'orders@medsupply.example',
        'Industrial Area, Nairobi',
      ],
      [
        'Pharma Distributors EA',
        'Peter Otieno',
        '+254733000222',
        '',
        'Kisumu',
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
      .map((r) => cell(r.values, 'Company Name'))
      .filter(Boolean);
    const existing = names.length
      ? await this.prisma.suppliers.findMany({
          where: {
            company_name: {
              in: [...new Set(names)],
              mode: 'insensitive',
            },
          },
          select: { company_name: true },
        })
      : [];
    const existingSet = new Set(
      existing.map((s) => s.company_name.toLowerCase()),
    );

    for (const raw of rawRows) {
      const rowNum = raw.index + 1;
      const rowErrors: BulkImportRowIssue[] = [];
      const companyName = cell(raw.values, 'Company Name');
      const contactPerson = cell(raw.values, 'Contact Person');
      const phone = cell(raw.values, 'Phone');
      const email = cell(raw.values, 'Email');
      const address = cell(raw.values, 'Address');

      if (!companyName) {
        rowErrors.push({
          row: rowNum,
          message: 'Company name is required.',
          field: 'Company Name',
        });
      } else if (seen.has(companyName.toLowerCase())) {
        rowErrors.push({
          row: rowNum,
          message: `Company name is duplicated in this file (also on row ${seen.get(companyName.toLowerCase())}).`,
          field: 'Company Name',
          value: companyName,
        });
      } else if (existingSet.has(companyName.toLowerCase())) {
        rowErrors.push({
          row: rowNum,
          message: `Supplier "${companyName}" already exists.`,
          field: 'Company Name',
          value: companyName,
        });
      } else {
        seen.set(companyName.toLowerCase(), rowNum);
      }

      if (phone && !isValidPhone(phone)) {
        rowErrors.push({
          row: rowNum,
          message: 'Phone number is invalid.',
          field: 'Phone',
          value: phone,
        });
      }
      if (email && !isValidEmail(email)) {
        rowErrors.push({
          row: rowNum,
          message: 'Email address is invalid.',
          field: 'Email',
          value: email,
        });
      }

      if (rowErrors.length) {
        errors.push(...rowErrors);
        continue;
      }

      valid.push({
        companyName,
        contactPerson: contactPerson || undefined,
        phone: phone || undefined,
        email: email || undefined,
        address: address || undefined,
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
        companyName: r.companyName,
        contactPerson: r.contactPerson,
        phone: r.phone,
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
        const created = await this.pharmacy.createSupplier({
          companyName: row.companyName!,
          contactPerson: row.contactPerson,
          phone: row.phone,
          email: row.email,
          address: row.address,
          actorUserId,
        });
        createdIds.push(created.id);
        imported += 1;
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        errors.push({
          row: rowNum,
          message: `Could not create supplier: ${message}`,
          value: row.companyName,
        });
        this.logger.warn(`Supplier import row ${rowNum}: ${message}`);
      }
    }

    await this.audit.recordMutation({
      userId: actorUserId,
      action: 'CREATE',
      entityType: 'bulk-import.suppliers',
      entityId: createdIds[0] ?? 'none',
      newValues: { imported, failed, total: rows.length },
    });

    return { imported, failed, skipped: 0, errors, createdIds };
  }
}
