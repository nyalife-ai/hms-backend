/**
 * Orchestrates bulk import validate → session → commit for registered resources.
 * Sessions live in Redis (30 min TTL) with in-memory fallback.
 * Commit is blocked when any row is invalid (clinical safety — no partial import).
 */

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CsvFormatError,
  readCsvRowsFromBuffer,
} from '../../platform/imports/csv-row-reader';
import { BedsBulkImporter } from './resources/beds-bulk.importer';
import type { BulkImportResource } from './resources/bulk-import-resource';
import { rowsToCsv } from './resources/csv-utils';
import { DoctorsBulkImporter } from './resources/doctors-bulk.importer';
import { LabTestTypesBulkImporter } from './resources/lab-test-types-bulk.importer';
import { MedicationsBulkImporter } from './resources/medications-bulk.importer';
import { PatientBulkImporter } from './resources/patient-bulk.importer';
import { ServicesBulkImporter } from './resources/services-bulk.importer';
import { SuppliersBulkImporter } from './resources/suppliers-bulk.importer';
import { WardsBulkImporter } from './resources/wards-bulk.importer';
import { ImportSessionStore } from './sessions/import-session.store';

@Injectable()
export class BulkImportsService {
  private readonly resources: Map<string, BulkImportResource>;

  public constructor(
    private readonly sessions: ImportSessionStore,
    patientImporter: PatientBulkImporter,
    doctorsImporter: DoctorsBulkImporter,
    wardsImporter: WardsBulkImporter,
    bedsImporter: BedsBulkImporter,
    labTestTypesImporter: LabTestTypesBulkImporter,
    servicesImporter: ServicesBulkImporter,
    medicationsImporter: MedicationsBulkImporter,
    suppliersImporter: SuppliersBulkImporter,
  ) {
    this.resources = new Map(
      [
        patientImporter,
        doctorsImporter,
        wardsImporter,
        bedsImporter,
        labTestTypesImporter,
        servicesImporter,
        medicationsImporter,
        suppliersImporter,
      ].map((r) => [r.resourceKey, r]),
    );
  }

  public getResource(resourceKey: string): BulkImportResource {
    const resource = this.resources.get(resourceKey);
    if (!resource) {
      throw new NotFoundException(
        `Import is not available for "${resourceKey}".`,
      );
    }
    return resource;
  }

  public getTemplate(resourceKey: string): { filename: string; csv: string } {
    const resource = this.getResource(resourceKey);
    return {
      filename: `${resource.resourceKey}-template.csv`,
      csv: resource.buildTemplateCsv(),
    };
  }

  public getExample(resourceKey: string): { filename: string; csv: string } {
    const resource = this.getResource(resourceKey);
    return {
      filename: `${resource.resourceKey}-example.csv`,
      csv: resource.buildExampleCsv(),
    };
  }

  public async validate(
    resourceKey: string,
    file: { buffer: Buffer; originalname?: string },
    actorUserId: string,
  ) {
    const resource = this.getResource(resourceKey);
    if (!file?.buffer?.length) {
      throw new BadRequestException('Please upload a CSV file.');
    }
    const name = (file.originalname || '').toLowerCase();
    if (name && !name.endsWith('.csv')) {
      throw new BadRequestException('The file must be a CSV (.csv).');
    }

    let rawRows: Array<{ index: number; values: Record<string, string> }>;
    try {
      rawRows = [];
      for await (const row of readCsvRowsFromBuffer(file.buffer)) {
        rawRows.push(row);
      }
    } catch (err) {
      if (err instanceof CsvFormatError) {
        throw new BadRequestException(err.message);
      }
      throw new BadRequestException(
        'The CSV file could not be read. Check that it is UTF-8 and well-formed.',
      );
    }

    if (!rawRows.length) {
      throw new BadRequestException('The CSV file has no data rows.');
    }

    // Header check from first data row keys (CSV first line = header)
    const presentHeaders = Object.keys(rawRows[0].values);
    const unknown = presentHeaders.filter(
      (h) => !(resource.headers as readonly string[]).includes(h),
    );
    if (unknown.length) {
      throw new BadRequestException(
        `Unsupported column(s): ${unknown.join(', ')}. Download the template and use the exact headers.`,
      );
    }
    const missingRequired = resource.requiredHeaders.filter(
      (h) => !presentHeaders.includes(h),
    );
    if (missingRequired.length) {
      throw new BadRequestException(
        `Missing required column(s): ${missingRequired.join(', ')}.`,
      );
    }

    const result = await resource.validate(rawRows);
    const session = await this.sessions.create({
      resourceKey,
      actorUserId,
      totalRows: result.totalRows,
      validRows: result.validRows,
      invalidRows: result.invalidRows,
      warningRows: result.warningRows,
      errors: result.errors,
      warnings: result.warnings,
      rows: result.rows,
    });

    return {
      sessionId: session.id,
      resource: resourceKey,
      totalRows: result.totalRows,
      validRows: result.validRows,
      invalidRows: result.invalidRows,
      warningRows: result.warningRows,
      canCommit: result.invalidRows === 0 && result.validRows > 0,
      errors: result.errors,
      warnings: result.warnings,
      previewSample: result.previewSample,
      expiresInMinutes: 30,
    };
  }

  public async commit(
    resourceKey: string,
    sessionId: string,
    actorUserId: string,
  ) {
    const resource = this.getResource(resourceKey);
    const session = await this.sessions.get(sessionId);
    if (!session || session.resourceKey !== resourceKey) {
      throw new NotFoundException(
        'This import review has expired or was not found. Upload the file again.',
      );
    }
    if (session.actorUserId !== actorUserId) {
      throw new ForbiddenException(
        'You can only confirm an import you started.',
      );
    }
    if (session.invalidRows > 0) {
      throw new BadRequestException(
        'Some records need attention. Fix the file and validate again before importing.',
      );
    }
    if (!session.rows.length) {
      throw new BadRequestException('There are no valid records to import.');
    }

    const result = await resource.commit(session.rows, actorUserId);
    await this.sessions.delete(sessionId);

    return {
      resource: resourceKey,
      imported: result.imported,
      failed: result.failed,
      skipped: result.skipped,
      errors: result.errors,
      createdIds: result.createdIds,
    };
  }

  public async getErrorsCsv(
    resourceKey: string,
    sessionId: string,
    actorUserId: string,
  ) {
    const session = await this.sessions.get(sessionId);
    if (!session || session.resourceKey !== resourceKey) {
      throw new NotFoundException(
        'This import review has expired or was not found.',
      );
    }
    if (session.actorUserId !== actorUserId) {
      throw new ForbiddenException('You can only download your own import report.');
    }
    const headers = ['Row', 'Field', 'Value', 'Message'];
    const rows = [
      ...session.errors.map((e) => [
        String(e.row),
        e.field ?? '',
        e.value ?? '',
        e.message,
      ]),
      ...session.warnings.map((w) => [
        String(w.row),
        w.field ?? '',
        w.value ?? '',
        `Warning: ${w.message}`,
      ]),
    ];
    return {
      filename: `${resourceKey}-import-errors.csv`,
      csv: rowsToCsv(headers, rows),
    };
  }
}
