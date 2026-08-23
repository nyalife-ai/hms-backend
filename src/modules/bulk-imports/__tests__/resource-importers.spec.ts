/**
 * Bulk resource importers — validate/commit behavior with mocked Prisma deps.
 */

import { DoctorsBulkImporter } from '../resources/doctors-bulk.importer';
import { MedicationsBulkImporter } from '../resources/medications-bulk.importer';
import { SuppliersBulkImporter } from '../resources/suppliers-bulk.importer';
import { ServicesBulkImporter } from '../resources/services-bulk.importer';
import { LabTestTypesBulkImporter } from '../resources/lab-test-types-bulk.importer';
import { cell, escapeCsvCell, rowsToCsv } from '../resources/csv-utils';

describe('csv-utils', () => {
  it('escapes and serializes CSV cells', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell('plain')).toBe('plain');
    const csv = rowsToCsv(['A', 'B'], [['1', 'x,y']]);
    expect(csv).toContain('A,B');
    expect(csv).toContain('"x,y"');
    expect(cell({ A: '  hi  ' }, 'A')).toBe('hi');
    expect(cell({}, 'missing')).toBe('');
  });
});

describe('DoctorsBulkImporter', () => {
  const prisma = {
    user: { findMany: jest.fn().mockResolvedValue([]) },
    departments: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'd1', name: 'Outpatient', code: 'OPD' },
      ]),
    },
    roles: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const audit = { recordMutation: jest.fn().mockResolvedValue(undefined) };
  let importer: DoctorsBulkImporter;

  beforeEach(() => {
    jest.clearAllMocks();
    importer = new DoctorsBulkImporter(prisma as never, audit as never);
  });

  it('builds template and example CSV', () => {
    expect(importer.buildTemplateCsv().trim().split('\n')).toHaveLength(1);
    expect(importer.buildTemplateCsv()).toContain('First Name');
    expect(importer.buildExampleCsv().trim().split('\n').length).toBeGreaterThan(
      1,
    );
  });

  it('accepts a valid doctor row', async () => {
    const result = await importer.validate([
      {
        index: 0,
        values: {
          'First Name': 'Amina',
          'Last Name': 'Okello',
          Email: 'amina@nyalife.local',
          Role: 'DOCTOR',
          Phone: '+254700100200',
          'Department Code': 'OPD',
          'Department Name': '',
          Specialty: 'GP',
        },
      },
    ]);
    expect(result.validRows).toBe(1);
    expect(result.invalidRows).toBe(0);
    expect(result.rows[0].email).toBe('amina@nyalife.local');
  });

  it('rejects missing fields, bad role, and duplicate emails', async () => {
    const result = await importer.validate([
      {
        index: 0,
        values: {
          'First Name': 'A',
          'Last Name': 'One',
          Email: 'dup@test.com',
          Role: 'DOCTOR',
          Phone: '',
          'Department Code': '',
          'Department Name': '',
          Specialty: '',
        },
      },
      {
        index: 1,
        values: {
          'First Name': '',
          'Last Name': '',
          Email: 'dup@test.com',
          Role: 'NOT_A_ROLE',
          Phone: 'bad',
          'Department Code': 'ZZZ',
          'Department Name': '',
          Specialty: '',
        },
      },
    ]);
    expect(result.invalidRows).toBeGreaterThan(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects email already in database', async () => {
    prisma.user.findMany.mockResolvedValueOnce([{ email: 'exists@test.com' }]);
    const result = await importer.validate([
      {
        index: 0,
        values: {
          'First Name': 'A',
          'Last Name': 'B',
          Email: 'exists@test.com',
          Role: 'NURSE',
          Phone: '',
          'Department Code': '',
          'Department Name': 'Outpatient',
          Specialty: '',
        },
      },
    ]);
    expect(result.invalidRows).toBe(1);
    expect(result.errors.some((e) => /already exists/i.test(e.message))).toBe(
      true,
    );
  });
});

describe('MedicationsBulkImporter', () => {
  const prisma = {
    medications: { findMany: jest.fn().mockResolvedValue([]) },
    categories: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'c1', category_name: 'Antibiotics' }]),
    },
  };
  const pharmacy = {
    createMedication: jest.fn().mockResolvedValue({ id: 'm1' }),
  };
  const audit = { recordMutation: jest.fn().mockResolvedValue(undefined) };
  let importer: MedicationsBulkImporter;

  beforeEach(() => {
    jest.clearAllMocks();
    importer = new MedicationsBulkImporter(
      prisma as never,
      pharmacy as never,
      audit as never,
    );
  });

  it('validates medication rows', async () => {
    const ok = await importer.validate([
      {
        index: 0,
        values: {
          'Medication Name': 'Amoxicillin 500mg',
          'Generic Name': 'Amoxicillin',
          Category: 'Antibiotics',
          Form: 'CAPSULE',
          Strength: '500mg',
          Unit: 'capsule',
          'Standard Selling Price': '25',
          Description: '',
        },
      },
    ]);
    expect(ok.validRows).toBe(1);

    const bad = await importer.validate([
      {
        index: 0,
        values: {
          'Medication Name': '',
          'Generic Name': '',
          Category: 'Missing',
          Form: 'PILL',
          Strength: '',
          Unit: '',
          'Standard Selling Price': '-1',
          Description: '',
        },
      },
    ]);
    expect(bad.invalidRows).toBe(1);
  });

  it('commits via pharmacy.createMedication', async () => {
    const result = await importer.commit(
      [
        {
          medicationName: 'Amoxicillin 500mg',
          categoryId: 'c1',
          form: 'CAPSULE',
          standardSellingPrice: '25',
          _row: '1',
        },
      ],
      'actor-1',
    );
    expect(result.imported).toBe(1);
    expect(pharmacy.createMedication).toHaveBeenCalled();
    expect(audit.recordMutation).toHaveBeenCalled();
  });
});

describe('SuppliersBulkImporter', () => {
  const prisma = {
    suppliers: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const pharmacy = {
    createSupplier: jest.fn().mockResolvedValue({ id: 's1' }),
  };
  const audit = { recordMutation: jest.fn().mockResolvedValue(undefined) };
  let importer: SuppliersBulkImporter;

  beforeEach(() => {
    jest.clearAllMocks();
    importer = new SuppliersBulkImporter(
      prisma as never,
      pharmacy as never,
      audit as never,
    );
  });

  it('validates company name and optional contacts', async () => {
    const ok = await importer.validate([
      {
        index: 0,
        values: {
          'Company Name': 'MedSupply',
          'Contact Person': 'Jane',
          Phone: '+254722000111',
          Email: 'orders@medsupply.example',
          Address: 'Nairobi',
        },
      },
    ]);
    expect(ok.validRows).toBe(1);

    const bad = await importer.validate([
      {
        index: 0,
        values: {
          'Company Name': '',
          'Contact Person': '',
          Phone: '123',
          Email: 'not-an-email',
          Address: '',
        },
      },
    ]);
    expect(bad.invalidRows).toBe(1);
  });

  it('commits via pharmacy.createSupplier', async () => {
    const result = await importer.commit(
      [{ companyName: 'MedSupply', _row: '1' }],
      'actor-1',
    );
    expect(result.imported).toBe(1);
    expect(pharmacy.createSupplier).toHaveBeenCalled();
  });
});

describe('ServicesBulkImporter', () => {
  const prisma = {
    services: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const finance = {
    createService: jest.fn().mockResolvedValue({ id: 'svc1' }),
  };
  const audit = { recordMutation: jest.fn().mockResolvedValue(undefined) };
  let importer: ServicesBulkImporter;

  beforeEach(() => {
    jest.clearAllMocks();
    importer = new ServicesBulkImporter(
      prisma as never,
      finance as never,
      audit as never,
    );
  });

  it('requires code, name, and numeric price', async () => {
    const ok = await importer.validate([
      {
        index: 0,
        values: {
          'Service Code': 'CONS-GP',
          'Service Name': 'General Consultation',
          Category: 'Consultation',
          Description: '',
          'Standard Price': '1500',
        },
      },
    ]);
    expect(ok.validRows).toBe(1);

    const bad = await importer.validate([
      {
        index: 0,
        values: {
          'Service Code': '',
          'Service Name': '',
          Category: '',
          Description: '',
          'Standard Price': 'abc',
        },
      },
    ]);
    expect(bad.invalidRows).toBe(1);
  });

  it('commits via finance.createService', async () => {
    const result = await importer.commit(
      [
        {
          serviceCode: 'CONS-GP',
          serviceName: 'General Consultation',
          standardPrice: '1500',
          _row: '1',
        },
      ],
      'actor-1',
    );
    expect(result.imported).toBe(1);
    expect(finance.createService).toHaveBeenCalled();
  });
});

describe('LabTestTypesBulkImporter', () => {
  const prisma = {
    testTypes: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const lab = {
    createTestType: jest.fn().mockResolvedValue({ id: 't1' }),
  };
  const audit = { recordMutation: jest.fn().mockResolvedValue(undefined) };
  let importer: LabTestTypesBulkImporter;

  beforeEach(() => {
    jest.clearAllMocks();
    importer = new LabTestTypesBulkImporter(
      prisma as never,
      lab as never,
      audit as never,
    );
  });

  it('validates unique test names', async () => {
    const ok = await importer.validate([
      {
        index: 0,
        values: {
          'Test Name': 'CBC',
          Category: 'Haematology',
          Description: 'Full blood count',
          'Standard Price': '1500',
        },
      },
    ]);
    expect(ok.validRows).toBe(1);

    const dup = await importer.validate([
      {
        index: 0,
        values: {
          'Test Name': 'CBC',
          Category: '',
          Description: '',
          'Standard Price': '10',
        },
      },
      {
        index: 1,
        values: {
          'Test Name': 'cbc',
          Category: '',
          Description: '',
          'Standard Price': '-5',
        },
      },
    ]);
    expect(dup.invalidRows).toBeGreaterThan(0);
  });

  it('commits via lab.createTestType', async () => {
    const result = await importer.commit(
      [
        {
          testName: 'CBC',
          category: 'Haematology',
          standardPrice: '1500',
          _row: '1',
        },
      ],
      'actor-1',
    );
    expect(result.imported).toBe(1);
    expect(lab.createTestType).toHaveBeenCalled();
  });
});
