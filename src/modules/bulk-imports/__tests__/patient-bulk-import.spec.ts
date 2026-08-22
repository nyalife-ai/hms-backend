/**
 * Patient bulk import — template, validate, commit, duplicates.
 */

import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BulkImportsService } from '../bulk-imports.service';
import { ImportSessionStore } from '../sessions/import-session.store';
import { PatientBulkImporter } from '../resources/patient-bulk.importer';
import {
  PATIENT_CSV_HEADERS,
  buildPatientExampleCsv,
  buildPatientTemplateCsv,
  normalizeGender,
  rowsToCsv,
} from '../resources/patient-csv.contract';

describe('patient CSV contract', () => {
  it('builds template with exact headers and no data rows', () => {
    const csv = buildPatientTemplateCsv();
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0].split(',')).toEqual([...PATIENT_CSV_HEADERS]);
  });

  it('builds example with two sample rows', () => {
    const csv = buildPatientExampleCsv();
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(3);
  });

  it('normalizes gender variants', () => {
    expect(normalizeGender('Female')).toBe('FEMALE');
    expect(normalizeGender('MALE')).toBe('MALE');
    expect(normalizeGender('other')).toBe('OTHER');
    expect(normalizeGender('X')).toBeNull();
  });
});

describe('PatientBulkImporter.validate', () => {
  const prisma = {
    user: { findMany: jest.fn().mockResolvedValue([]) },
    patients: { findMany: jest.fn().mockResolvedValue([]) },
    profiles: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const patients = { create: jest.fn() };
  const audit = { recordMutation: jest.fn().mockResolvedValue(undefined) };

  let importer: PatientBulkImporter;

  beforeEach(() => {
    jest.clearAllMocks();
    importer = new PatientBulkImporter(
      patients as never,
      prisma as never,
      audit as never,
    );
  });

  function row(
    index: number,
    values: Partial<Record<(typeof PATIENT_CSV_HEADERS)[number], string>>,
  ) {
    const full: Record<string, string> = {};
    for (const h of PATIENT_CSV_HEADERS) full[h] = values[h] ?? '';
    return { index, values: full };
  }

  it('accepts a valid row', async () => {
    const result = await importer.validate([
      row(0, {
        'First Name': 'Amina',
        'Last Name': 'Okello',
        Gender: 'Female',
        Phone: '+254712345678',
      }),
    ]);
    expect(result.validRows).toBe(1);
    expect(result.invalidRows).toBe(0);
    expect(result.rows[0].gender).toBe('FEMALE');
  });

  it('rejects missing required fields', async () => {
    const result = await importer.validate([
      row(0, { 'First Name': 'Amina', Gender: 'Female' }),
    ]);
    expect(result.invalidRows).toBe(1);
    expect(result.errors.some((e) => /Last name/i.test(e.message))).toBe(true);
    expect(result.errors.some((e) => /Phone/i.test(e.message))).toBe(true);
  });

  it('rejects invalid gender and date', async () => {
    const result = await importer.validate([
      row(0, {
        'First Name': 'A',
        'Last Name': 'B',
        Gender: 'Unknown',
        Phone: '+254700000000',
        'Date of Birth': '32-13-2020',
      }),
    ]);
    expect(result.invalidRows).toBe(1);
    expect(result.errors.some((e) => /Gender/i.test(e.message))).toBe(true);
    expect(result.errors.some((e) => /Date of birth/i.test(e.message))).toBe(
      true,
    );
  });

  it('detects duplicate email within CSV', async () => {
    const result = await importer.validate([
      row(0, {
        'First Name': 'A',
        'Last Name': 'One',
        Gender: 'Male',
        Phone: '+254711111111',
        Email: 'dup@example.com',
      }),
      row(1, {
        'First Name': 'B',
        'Last Name': 'Two',
        Gender: 'Female',
        Phone: '+254722222222',
        Email: 'dup@example.com',
      }),
    ]);
    expect(result.invalidRows).toBe(1);
    expect(result.errors.some((e) => /duplicated in this file/i.test(e.message))).toBe(
      true,
    );
  });

  it('detects MRN already in database', async () => {
    prisma.patients.findMany.mockResolvedValueOnce([
      { patient_number: 'MRN-10001' },
    ]);
    const result = await importer.validate([
      row(0, {
        'First Name': 'A',
        'Last Name': 'B',
        Gender: 'Male',
        Phone: '+254700000001',
        'Medical Record Number': 'MRN-10001',
      }),
    ]);
    expect(result.invalidRows).toBe(1);
    expect(result.errors.some((e) => /already exists/i.test(e.message))).toBe(
      true,
    );
  });

  it('warns on existing phone but still marks row valid', async () => {
    prisma.profiles.findMany.mockResolvedValueOnce([
      { phone: '+254712345678' },
    ]);
    const result = await importer.validate([
      row(0, {
        'First Name': 'Amina',
        'Last Name': 'Okello',
        Gender: 'Female',
        Phone: '+254712345678',
      }),
    ]);
    expect(result.validRows).toBe(1);
    expect(result.warningRows).toBe(1);
    expect(result.warnings[0].message).toMatch(/may already exist/i);
  });
});

describe('BulkImportsService', () => {
  let service: BulkImportsService;
  const patients = {
    create: jest.fn().mockResolvedValue({ id: 'p1' }),
  };
  const prisma = {
    user: { findMany: jest.fn().mockResolvedValue([]) },
    patients: { findMany: jest.fn().mockResolvedValue([]) },
    profiles: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const audit = { recordMutation: jest.fn().mockResolvedValue(undefined) };

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

  beforeEach(async () => {
    jest.clearAllMocks();
    const { ConfigService } = await import('@nestjs/config');
    const { DoctorsBulkImporter } = await import(
      '../resources/doctors-bulk.importer'
    );
    const { WardsBulkImporter } = await import(
      '../resources/wards-bulk.importer'
    );
    const { BedsBulkImporter } = await import('../resources/beds-bulk.importer');
    const { LabTestTypesBulkImporter } = await import(
      '../resources/lab-test-types-bulk.importer'
    );
    const { ServicesBulkImporter } = await import(
      '../resources/services-bulk.importer'
    );
    const { MedicationsBulkImporter } = await import(
      '../resources/medications-bulk.importer'
    );
    const { SuppliersBulkImporter } = await import(
      '../resources/suppliers-bulk.importer'
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        BulkImportsService,
        ImportSessionStore,
        { provide: ConfigService, useValue: { get: () => undefined } },
        {
          provide: PatientBulkImporter,
          useFactory: () =>
            new PatientBulkImporter(
              patients as never,
              prisma as never,
              audit as never,
            ),
        },
        { provide: DoctorsBulkImporter, useValue: stubImporter('doctors') },
        { provide: WardsBulkImporter, useValue: stubImporter('wards') },
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

  it('rejects unknown columns', async () => {
    const csv = rowsToCsv(
      [...PATIENT_CSV_HEADERS, 'Secret Password'],
      [
        [
          'A',
          'B',
          'Female',
          '+254700000000',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          'hack',
        ],
      ],
    );
    await expect(
      service.validate(
        'patients',
        { buffer: Buffer.from(csv), originalname: 'x.csv' },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects empty CSV', async () => {
    const csv = buildPatientTemplateCsv();
    await expect(
      service.validate(
        'patients',
        { buffer: Buffer.from(csv), originalname: 'empty.csv' },
        'user-1',
      ),
    ).rejects.toThrow(/no data rows/i);
  });

  it('validate then commit happy path', async () => {
    const csv = rowsToCsv(PATIENT_CSV_HEADERS, [
      [
        'Amina',
        'Okello',
        'Female',
        '+254712345678',
        '1990-05-12',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ],
    ]);
    const preview = await service.validate(
      'patients',
      { buffer: Buffer.from(csv), originalname: 'ok.csv' },
      'user-1',
    );
    expect(preview.canCommit).toBe(true);
    expect(preview.validRows).toBe(1);

    const result = await service.commit(
      'patients',
      preview.sessionId,
      'user-1',
    );
    expect(result.imported).toBe(1);
    expect(patients.create).toHaveBeenCalled();
    expect(audit.recordMutation).toHaveBeenCalled();
  });

  it('blocks commit when session has invalids', async () => {
    const csv = rowsToCsv(PATIENT_CSV_HEADERS, [
      [
        'Amina',
        '',
        'Female',
        '+254712345678',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ],
    ]);
    const preview = await service.validate(
      'patients',
      { buffer: Buffer.from(csv), originalname: 'bad.csv' },
      'user-1',
    );
    expect(preview.canCommit).toBe(false);
    await expect(
      service.commit('patients', preview.sessionId, 'user-1'),
    ).rejects.toThrow(/need attention/i);
  });

  it('forbids commit by a different user', async () => {
    const csv = rowsToCsv(PATIENT_CSV_HEADERS, [
      [
        'Amina',
        'Okello',
        'Female',
        '+254712345678',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ],
    ]);
    const preview = await service.validate(
      'patients',
      { buffer: Buffer.from(csv), originalname: 'ok.csv' },
      'user-1',
    );
    await expect(
      service.commit('patients', preview.sessionId, 'user-2'),
    ).rejects.toThrow(/only confirm an import you started/i);
  });

  it('returns template and example', () => {
    expect(service.getTemplate('patients').csv).toContain('First Name');
    expect(service.getExample('patients').csv.split('\n').length).toBeGreaterThan(
      2,
    );
  });

  it('rejects unknown resource', () => {
    expect(() => service.getTemplate('widgets')).toThrow();
  });
});
