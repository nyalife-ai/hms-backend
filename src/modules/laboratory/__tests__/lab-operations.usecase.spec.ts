/**
 * Laboratory operations unit tests — catalog + lists.
 */

import { BadRequestException, ConflictException } from '@nestjs/common';
import { LabOperationsUseCase } from '../use-cases/lab-operations.usecase';

describe('LabOperationsUseCase', () => {
  let prisma: any;
  let ops: LabOperationsUseCase;

  beforeEach(() => {
    prisma = {
      testTypes: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      testCategories: {
        upsert: jest.fn().mockResolvedValue({ id: 'cat1', name: 'Haematology' }),
      },
      serviceCategories: {
        upsert: jest.fn().mockResolvedValue({ id: 'scat1', name: 'Procedure' }),
      },
      testParameters: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      laboratoryRequests: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
      },
      samples: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
      results: { findMany: jest.fn(), count: jest.fn() },
      outpatientVisits: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
      services: {
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    ops = new LabOperationsUseCase(prisma, {
      recordMutation: jest.fn().mockResolvedValue(undefined),
    } as any);
    jest.clearAllMocks();
  });

  it('overview returns board counts', async () => {
    prisma.testTypes.count = jest.fn().mockResolvedValue(3);
    prisma.laboratoryRequests.count = jest.fn().mockResolvedValue(2);
    prisma.samples.count = jest.fn().mockResolvedValue(1);
    prisma.results.count = jest.fn().mockResolvedValue(0);
    const board = await ops.overview();
    expect(board.activeTestTypes).toBe(3);
    expect(board.pendingRequests).toBe(2);
  });

  it('rejects negative standard price', async () => {
    await expect(
      ops.createTestType({ testName: 'CBC', standardPrice: -1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates test type', async () => {
    prisma.testTypes.create.mockResolvedValue({
      id: 'tt1',
      test_name: 'CBC',
      category: 'Haematology',
      description: null,
      standard_price: 500,
      is_active: true,
      laboratory_test_parameters_test_type_id: [],
    });
    const row = await ops.createTestType({
      testName: 'CBC',
      category: 'Haematology',
      standardPrice: 500,
    });
    expect(row.testName).toBe('CBC');
    expect(row.standardPrice).toBe(500);
  });

  it('maps unique violation to ConflictException', async () => {
    const { Prisma } = require('../../../generated/prisma');
    prisma.testTypes.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      ops.createTestType({ testName: 'CBC' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates parameter under test type', async () => {
    prisma.testTypes.findFirst.mockResolvedValue({
      id: 'tt1',
      test_name: 'CBC',
      category: null,
      description: null,
      standard_price: 0,
      is_active: true,
      laboratory_test_parameters_test_type_id: [],
    });
    prisma.testParameters.create.mockResolvedValue({
      id: 'p1',
      test_type_id: 'tt1',
      parameter_name: 'Hemoglobin',
      unit_of_measurement: 'g/dL',
      normal_reference_range: '12-16',
      display_order: 1,
      is_active: true,
      test_type: { test_name: 'CBC' },
    });
    const p = await ops.createParameter({
      testTypeId: 'tt1',
      parameterName: 'Hemoglobin',
      unitOfMeasurement: 'g/dL',
      normalReferenceRange: '12-16',
      displayOrder: 1,
    });
    expect(p.parameterName).toBe('Hemoglobin');
  });

  it('rejects invalid request status filter', async () => {
    await expect(
      ops.listRequests({ status: 'PROCESSING' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('encodes and parses ordered test notes', () => {
    const raw = ops.encodeNotes(['a', 'b'], 'fasting');
    expect(raw).toContain('orderedTestTypeIds');
    const parsed = ops.parseNotes(raw);
    expect(parsed.orderedTestTypeIds).toEqual(['a', 'b']);
    expect(parsed.text).toBe('fasting');
    expect(ops.parseNotes('plain notes').text).toBe('plain notes');
  });

  it('preserves visitId and release metadata across encode/parse', () => {
    const raw = ops.encodeNotesPayload({
      orderedTestTypeIds: ['tt1'],
      text: 'note',
      visitId: 'visit-uuid',
      doctorName: 'Dr X',
      tests: [{ name: 'CBC', unit: 'g/dL' }],
      releasedToDoctorAt: '2026-08-13T12:00:00.000Z',
      releasedToDoctorBy: 'user-1',
    });
    const parsed = ops.parseNotes(raw);
    expect(parsed.visitId).toBe('visit-uuid');
    expect(parsed.doctorName).toBe('Dr X');
    expect(parsed.tests?.[0]?.name).toBe('CBC');
    expect(parsed.releasedToDoctorAt).toBe('2026-08-13T12:00:00.000Z');
    expect(parsed.releasedToDoctorBy).toBe('user-1');
  });
});
