/**
 * Wards / beds / clinical safety — header first line; no partial commit of invalid CSVs.
 */

import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { BulkImportsService } from '../bulk-imports.service';
import { BedsBulkImporter } from '../resources/beds-bulk.importer';
import { DoctorsBulkImporter } from '../resources/doctors-bulk.importer';
import { LabTestTypesBulkImporter } from '../resources/lab-test-types-bulk.importer';
import { MedicationsBulkImporter } from '../resources/medications-bulk.importer';
import { PatientBulkImporter } from '../resources/patient-bulk.importer';
import { ServicesBulkImporter } from '../resources/services-bulk.importer';
import { SuppliersBulkImporter } from '../resources/suppliers-bulk.importer';
import { WardsBulkImporter } from '../resources/wards-bulk.importer';
import { rowsToCsv } from '../resources/csv-utils';
import { ImportSessionStore } from '../sessions/import-session.store';

function stubImporter(resourceKey: string) {
  return {
    resourceKey,
    displayName: resourceKey,
    headers: [] as const,
    requiredHeaders: [] as const,
    buildTemplateCsv: () => '',
    buildExampleCsv: () => '',
    validate: async () => ({
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      warningRows: 0,
      errors: [],
      warnings: [],
      rows: [],
      previewSample: [],
    }),
    commit: async () => ({
      imported: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      createdIds: [],
    }),
  };
}

describe('WardsBulkImporter', () => {
  const prisma = {
    wards: { findMany: jest.fn().mockResolvedValue([]) },
    departments: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const journey = { createWard: jest.fn().mockResolvedValue({ id: 'w1' }) };
  const audit = { recordMutation: jest.fn().mockResolvedValue(undefined) };
  let importer: WardsBulkImporter;

  beforeEach(() => {
    jest.clearAllMocks();
    importer = new WardsBulkImporter(
      prisma as never,
      journey as never,
      audit as never,
    );
  });

  it('accepts a valid ward row', async () => {
    const result = await importer.validate([
      {
        index: 0,
        values: {
          'Ward Name': 'General A',
          'Ward Type': 'GENERAL',
          'Department Code': '',
          'Department Name': '',
          'Daily Rate': '1000',
          Capacity: '10',
        },
      },
    ]);
    expect(result.validRows).toBe(1);
    expect(result.invalidRows).toBe(0);
  });

  it('rejects duplicate ward names in file', async () => {
    const result = await importer.validate([
      {
        index: 0,
        values: {
          'Ward Name': 'ICU',
          'Ward Type': 'ICU',
          'Department Code': '',
          'Department Name': '',
          'Daily Rate': '',
          Capacity: '',
        },
      },
      {
        index: 1,
        values: {
          'Ward Name': 'icu',
          'Ward Type': 'ICU',
          'Department Code': '',
          'Department Name': '',
          'Daily Rate': '',
          Capacity: '',
        },
      },
    ]);
    expect(result.invalidRows).toBeGreaterThan(0);
  });
});

describe('BedsBulkImporter', () => {
  const prisma = {
    wards: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'w1', name: 'General A' }]),
    },
    beds: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const journey = { createBed: jest.fn().mockResolvedValue({ id: 'b1' }) };
  const audit = { recordMutation: jest.fn().mockResolvedValue(undefined) };
  let importer: BedsBulkImporter;

  beforeEach(() => {
    jest.clearAllMocks();
    importer = new BedsBulkImporter(
      prisma as never,
      journey as never,
      audit as never,
    );
  });

  it('resolves ward by name', async () => {
    const result = await importer.validate([
      {
        index: 0,
        values: { 'Ward Name': 'General A', 'Bed Number': 'A-01' },
      },
    ]);
    expect(result.validRows).toBe(1);
    expect(result.rows[0].wardId).toBe('w1');
  });

  it('rejects unknown ward', async () => {
    const result = await importer.validate([
      {
        index: 0,
        values: { 'Ward Name': 'Missing', 'Bed Number': 'A-01' },
      },
    ]);
    expect(result.invalidRows).toBe(1);
  });
});

describe('BulkImportsService clinical safety across resources', () => {
  let service: BulkImportsService;
  const journey = {
    createWard: jest.fn().mockResolvedValue({ id: 'w1' }),
  };
  const prisma = {
    wards: { findMany: jest.fn().mockResolvedValue([]) },
    departments: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const audit = { recordMutation: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        BulkImportsService,
        ImportSessionStore,
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: PatientBulkImporter, useValue: stubImporter('patients') },
        { provide: DoctorsBulkImporter, useValue: stubImporter('doctors') },
        {
          provide: WardsBulkImporter,
          useFactory: () =>
            new WardsBulkImporter(
              prisma as never,
              journey as never,
              audit as never,
            ),
        },
        { provide: BedsBulkImporter, useValue: stubImporter('beds') },
        {
          provide: LabTestTypesBulkImporter,
          useValue: stubImporter('lab-test-types'),
        },
        { provide: ServicesBulkImporter, useValue: stubImporter('services') },
        {
          provide: MedicationsBulkImporter,
          useValue: stubImporter('medications'),
        },
        {
          provide: SuppliersBulkImporter,
          useValue: stubImporter('suppliers'),
        },
      ],
    }).compile();
    service = moduleRef.get(BulkImportsService);
  });

  it('exposes templates for all resources', () => {
    for (const key of [
      'patients',
      'doctors',
      'wards',
      'beds',
      'lab-test-types',
      'services',
      'medications',
      'suppliers',
    ]) {
      expect(() => service.getTemplate(key)).not.toThrow();
    }
  });

  it('blocks commit when any ward row is invalid', async () => {
    const csv = rowsToCsv(
      [
        'Ward Name',
        'Ward Type',
        'Department Code',
        'Department Name',
        'Daily Rate',
        'Capacity',
      ],
      [['', 'GENERAL', '', '', '0', '0']],
    );
    const preview = await service.validate(
      'wards',
      { buffer: Buffer.from(csv), originalname: 'bad-wards.csv' },
      'user-1',
    );
    expect(preview.canCommit).toBe(false);
    expect(preview.invalidRows).toBe(1);
    await expect(
      service.commit('wards', preview.sessionId, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('treats first CSV line as header', async () => {
    const csv = [
      'Ward Name,Ward Type,Department Code,Department Name,Daily Rate,Capacity',
      'Ward Z,GENERAL,,,0,0',
    ].join('\n');
    const preview = await service.validate(
      'wards',
      { buffer: Buffer.from(csv), originalname: 'wards.csv' },
      'user-1',
    );
    expect(preview.validRows).toBe(1);
    expect(preview.canCommit).toBe(true);
  });
});
