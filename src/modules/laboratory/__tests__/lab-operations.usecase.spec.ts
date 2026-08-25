/**
 * Laboratory operations unit tests — catalog + lists + clinical services.
 */

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { LabOperationsUseCase } from '../use-cases/lab-operations.usecase';

const profile = (first = 'Jane', last = 'Doe') => [
  { first_name: first, last_name: last, phone: '0700', gender: 'F', date_of_birth: new Date('1990-06-15') },
];

function baseTestType(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tt1',
    test_name: 'CBC',
    category: 'Haematology',
    category_id: 'cat1',
    description: null,
    units: null,
    normal_range: null,
    template: null,
    standard_price: 500,
    is_active: true,
    laboratory_test_parameters_test_type_id: [],
    ...overrides,
  };
}

function baseRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req1',
    request_number: 'LAB-ABCDEF12',
    patient_id: 'p1',
    requesting_doctor_id: 'd1',
    consultation_id: null,
    priority: 'NORMAL',
    request_date: new Date('2026-08-01'),
    status: 'PENDING',
    notes: JSON.stringify({ orderedTestTypeIds: ['tt1'], visitId: 'visit-1' }),
    requested_by: 'u1',
    created_at: new Date('2026-08-01'),
    updated_at: new Date('2026-08-02'),
    patient: {
      patient_number: 'MRN1',
      user: { email: 'p@x.com', core_profiles_user_id: profile() },
    },
    requesting_doctor: {
      department_id: 'dep1',
      specialization: 'Internal',
      position: 'Consultant',
      user: { core_profiles_user_id: profile('Doc', 'Tor') },
    },
    consultation: null,
    laboratory_samples_request_id: [],
    laboratory_results_request_id: [],
    ...overrides,
  };
}

describe('LabOperationsUseCase', () => {
  let prisma: any;
  let audit: { recordMutation: jest.Mock };
  let ops: LabOperationsUseCase;

  beforeEach(() => {
    prisma = {
      testTypes: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      testCategories: {
        upsert: jest.fn().mockResolvedValue({ id: 'cat1', name: 'Haematology' }),
      },
      serviceCategories: {
        upsert: jest.fn().mockResolvedValue({ id: 'scat1', name: 'Procedure' }),
      },
      testParameters: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      laboratoryRequests: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
      },
      samples: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      results: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      outpatientVisits: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
      services: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      accounts: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'acc1',
          is_active: true,
          is_postable: true,
          account_type: 'REVENUE',
        }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'u1',
          email: 'req@x.com',
          core_profiles_user_id: profile('Req', 'User'),
        }),
      },
      departments: {
        findFirst: jest.fn().mockResolvedValue({ name: 'Medicine' }),
      },
    };
    audit = { recordMutation: jest.fn().mockResolvedValue(undefined) };
    ops = new LabOperationsUseCase(prisma, audit as any);
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
    expect(board.outpatientQueue).toEqual([]);
  });

  it('overview builds outpatient queue and skips released visits', async () => {
    const visitId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    prisma.testTypes.count.mockResolvedValue(0);
    prisma.laboratoryRequests.count.mockResolvedValue(0);
    prisma.samples.count.mockResolvedValue(0);
    prisma.results.count.mockResolvedValue(0);
    prisma.outpatientVisits.findMany.mockResolvedValue([
      {
        id: visitId,
        mrn: 'M1',
        patient_name: 'Pat',
        payload: { labOrder: { tests: [{}, {}] } },
        updated_at: new Date(),
      },
      {
        id: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee',
        mrn: 'M2',
        patient_name: 'Released',
        payload: null,
        updated_at: new Date(),
      },
      {
        id: 'cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee',
        mrn: 'M3',
        patient_name: 'Done',
        payload: { labOrder: { tests: [] } },
        updated_at: new Date(),
      },
      {
        id: 'dddddddd-bbbb-cccc-dddd-eeeeeeeeeeee',
        mrn: 'M4',
        patient_name: 'Pending',
        payload: 'raw',
        updated_at: new Date(),
      },
    ]);
    prisma.laboratoryRequests.findFirst
      .mockResolvedValueOnce({
        id: 'r1',
        request_number: 'LAB-AAAAAAAA',
        status: 'IN_PROGRESS',
        notes: JSON.stringify({ orderedTestTypeIds: [] }),
      })
      .mockResolvedValueOnce({
        id: 'r2',
        request_number: 'LAB-BBBBBBBB',
        status: 'COMPLETED',
        notes: JSON.stringify({
          orderedTestTypeIds: [],
          releasedToDoctorAt: '2026-08-01T00:00:00.000Z',
        }),
      })
      .mockResolvedValueOnce({
        id: 'r3',
        request_number: 'LAB-CCCCCCCC',
        status: 'COMPLETED',
        notes: JSON.stringify({ orderedTestTypeIds: [] }),
      })
      .mockResolvedValueOnce({
        id: 'r4',
        request_number: 'LAB-DDDDDDDD',
        status: 'PENDING',
        notes: null,
      });

    const board = await ops.overview();
    expect(board.outpatientQueue).toHaveLength(3);
    expect(board.outpatientQueue[0].badge).toBe('IN_PROGRESS');
    expect(board.outpatientQueue[0].testCount).toBe(2);
    expect(board.outpatientQueue[1].badge).toBe('COMPLETED');
    expect(board.outpatientQueue[2].badge).toBe('PENDING');
  });

  it('rejects negative standard price', async () => {
    await expect(
      ops.createTestType({ testName: 'CBC', standardPrice: -1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects empty/too-long testName on create', async () => {
    await expect(ops.createTestType({ testName: '  ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      ops.createTestType({ testName: 'x'.repeat(256) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates test type', async () => {
    prisma.testTypes.create.mockResolvedValue(baseTestType());
    const row = await ops.createTestType({
      testName: 'CBC',
      category: 'Haematology',
      standardPrice: 500,
    });
    expect(row.testName).toBe('CBC');
    expect(row.standardPrice).toBe(500);
    expect(audit.recordMutation).toHaveBeenCalled();
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

  it('rethrows non-unique create errors', async () => {
    prisma.testTypes.create.mockRejectedValue(new Error('db down'));
    await expect(ops.createTestType({ testName: 'CBC' })).rejects.toThrow(
      'db down',
    );
  });

  it('lists and gets test types', async () => {
    prisma.testTypes.findMany.mockResolvedValue([baseTestType()]);
    prisma.testTypes.count.mockResolvedValue(1);
    const listed = await ops.listTestTypes({
      search: 'CBC',
      category: 'Haematology',
      active: true,
      take: 10,
      skip: 0,
    });
    expect(listed.total).toBe(1);
    expect(listed.items[0].testName).toBe('CBC');

    prisma.testTypes.findFirst.mockResolvedValue(baseTestType());
    const one = await ops.getTestType('tt1');
    expect(one.id).toBe('tt1');

    prisma.testTypes.findFirst.mockResolvedValue(null);
    await expect(ops.getTestType('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates and deactivates test type', async () => {
    prisma.testTypes.findFirst.mockResolvedValue(baseTestType());
    prisma.testTypes.update.mockResolvedValue(
      baseTestType({ is_active: false, test_name: 'CBC2' }),
    );
    const updated = await ops.updateTestType('tt1', {
      testName: 'CBC2',
      category: 'Chem',
      description: 'd',
      standardPrice: 10,
      isActive: false,
      actorUserId: 'u1',
    });
    expect(updated.testName).toBe('CBC2');

    await expect(
      ops.updateTestType('tt1', { standardPrice: -1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      ops.updateTestType('tt1', { testName: '  ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      ops.updateTestType('tt1', { testName: 'x'.repeat(256) }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const { Prisma } = require('../../../generated/prisma');
    prisma.testTypes.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      ops.updateTestType('tt1', { testName: 'Dup' }),
    ).rejects.toBeInstanceOf(ConflictException);

    prisma.testTypes.update.mockRejectedValue(new Error('update fail'));
    await expect(
      ops.updateTestType('tt1', { testName: 'Other' }),
    ).rejects.toThrow('update fail');

    prisma.testTypes.update.mockResolvedValue(baseTestType({ is_active: true }));
    const active = await ops.setTestTypeActive('tt1', true, 'u1');
    expect(active.isActive).toBe(true);
  });

  it('creates parameter under test type', async () => {
    prisma.testTypes.findFirst.mockResolvedValue(baseTestType());
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

  it('lists/gets/updates parameters with validation', async () => {
    prisma.testParameters.findMany.mockResolvedValue([
      {
        id: 'p1',
        test_type_id: 'tt1',
        parameter_name: 'Hb',
        unit_of_measurement: 'g/dL',
        normal_reference_range: '12-16',
        display_order: 0,
        is_active: true,
        test_type: { test_name: 'CBC' },
      },
    ]);
    const listed = await ops.listParameters({
      testTypeId: 'tt1',
      active: true,
      search: 'Hb',
    });
    expect(listed[0].parameterName).toBe('Hb');

    prisma.testParameters.findFirst.mockResolvedValue(null);
    await expect(ops.getParameter('x')).rejects.toBeInstanceOf(NotFoundException);

    prisma.testParameters.findFirst.mockResolvedValue({
      id: 'p1',
      test_type_id: 'tt1',
      parameter_name: 'Hb',
      unit_of_measurement: null,
      normal_reference_range: null,
      display_order: 0,
      is_active: true,
      test_type: { test_name: 'CBC' },
    });
    prisma.testParameters.update.mockResolvedValue({
      id: 'p1',
      test_type_id: 'tt1',
      parameter_name: 'HGB',
      unit_of_measurement: 'g/dL',
      normal_reference_range: '11-15',
      display_order: 2,
      is_active: false,
      test_type: { test_name: 'CBC' },
    });
    const updated = await ops.updateParameter('p1', {
      parameterName: 'HGB',
      unitOfMeasurement: 'g/dL',
      normalReferenceRange: '11-15',
      displayOrder: 2,
      isActive: false,
      actorUserId: 'u1',
    });
    expect(updated.parameterName).toBe('HGB');

    prisma.testTypes.findFirst.mockResolvedValue(baseTestType());
    await expect(
      ops.createParameter({ testTypeId: 'tt1', parameterName: '  ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      ops.createParameter({
        testTypeId: 'tt1',
        parameterName: 'x'.repeat(101),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      ops.updateParameter('p1', { parameterName: '  ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid request status filter', async () => {
    await expect(
      ops.listRequests({ status: 'PROCESSING' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid priority and lists requests with filters', async () => {
    await expect(
      ops.listRequests({ priority: 'ASAP' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.laboratoryRequests.findMany.mockResolvedValue([baseRequest()]);
    prisma.laboratoryRequests.count.mockResolvedValue(1);
    const listed = await ops.listRequests({
      status: 'pending',
      priority: 'urgent',
      patientId: 'p1',
      requestingDoctorId: 'd1',
      search: 'LAB',
      from: new Date('2026-01-01'),
      to: new Date('2026-12-31'),
      visitId: 'visit-1',
      take: 20,
      skip: 0,
    });
    expect(listed.total).toBe(1);
    expect(listed.items[0].id).toBe('req1');

    prisma.outpatientVisits.findMany.mockResolvedValue([
      { id: 'visit-appt-1' },
    ]);
    await ops.listRequests({
      appointmentId: 'appt-1',
      consultationId: 'c1',
    });
    expect(prisma.outpatientVisits.findMany).toHaveBeenCalled();
  });

  it('gets request detail with age, department, and panels', async () => {
    prisma.laboratoryRequests.findFirst.mockResolvedValue(
      baseRequest({
        laboratory_results_request_id: [
          {
            id: 'res1',
            request_id: 'req1',
            parameter_id: 'p1',
            result_value: '14',
            interpretation: 'NORMAL',
            notes: null,
            performed_by: 'u1',
            performed_at: new Date(),
            verified_by: 'u2',
            verified_at: new Date(),
            parameter: {
              parameter_name: 'Hb',
              unit_of_measurement: 'g/dL',
              normal_reference_range: '12-16',
              test_type: { id: 'tt1', test_name: 'CBC' },
            },
            rel_performed_by: { email: 'a@x.com' },
            rel_verified_by: { email: 'b@x.com' },
          },
        ],
        laboratory_samples_request_id: [
          {
            id: 's1',
            sample_id: 'S-1',
            request_id: 'req1',
            patient_id: 'p1',
            sample_type: 'Blood',
            collected_date: new Date('2026-08-01'),
            collected_at: new Date('2026-08-01T10:00:00Z'),
            collected_by: 'n1',
            status: 'REGISTERED',
            notes: null,
            request: { request_number: 'LAB-ABCDEF12', status: 'PENDING' },
            patient: {
              patient_number: 'MRN1',
              user: { core_profiles_user_id: profile() },
            },
            rel_collected_by: {
              user: { core_profiles_user_id: profile('Nurse', 'One') },
            },
          },
        ],
      }),
    );
    prisma.testTypes.findMany.mockResolvedValue([
      baseTestType({
        laboratory_test_parameters_test_type_id: [
          {
            id: 'p1',
            test_type_id: 'tt1',
            parameter_name: 'Hb',
            unit_of_measurement: 'g/dL',
            normal_reference_range: '12-16',
            display_order: 0,
            is_active: true,
          },
        ],
      }),
    ]);

    const detail = await ops.getRequest('req1');
    expect(detail.patientAge).toBeGreaterThan(0);
    expect(detail.requestingDoctorDepartment).toBe('Medicine');
    expect(detail.resultCount).toBe(1);
    expect(detail.allVerified).toBe(true);
    expect(detail.orderedTestTypes).toHaveLength(1);

    prisma.laboratoryRequests.findFirst.mockResolvedValue(null);
    await expect(ops.getRequest('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('getRequest falls back to specialization when no department', async () => {
    prisma.departments.findFirst.mockResolvedValue(null);
    prisma.laboratoryRequests.findFirst.mockResolvedValue(
      baseRequest({
        requesting_doctor: {
          department_id: 'dep1',
          specialization: 'Cardio',
          position: 'Consultant',
          user: { core_profiles_user_id: profile('Doc', 'Tor') },
        },
      }),
    );
    prisma.testTypes.findMany.mockResolvedValue([]);
    const detail = await ops.getRequest('req1');
    expect(detail.requestingDoctorDepartment).toBe('Cardio');
  });

  it('getVisitLabReport filters released requests', async () => {
    await expect(ops.getVisitLabReport('  ')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    prisma.laboratoryRequests.findMany.mockResolvedValue([
      baseRequest({ id: 'req1' }),
      baseRequest({ id: 'req2' }),
    ]);
    prisma.laboratoryRequests.count.mockResolvedValue(2);

    const releasedNotes = JSON.stringify({
      orderedTestTypeIds: ['tt1'],
      visitId: 'visit-1',
      releasedToDoctorAt: '2026-08-10T12:00:00.000Z',
      releasedToDoctorBy: 'u1',
      observations: 'Obs',
      conclusion: 'Conc',
    });
    prisma.laboratoryRequests.findFirst
      .mockResolvedValueOnce(
        baseRequest({
          id: 'req1',
          notes: releasedNotes,
          laboratory_results_request_id: [
            {
              id: 'res1',
              request_id: 'req1',
              parameter_id: 'p1',
              result_value: '1',
              interpretation: 'CRITICAL',
              notes: null,
              performed_by: null,
              performed_at: null,
              verified_by: null,
              verified_at: null,
              parameter: {
                parameter_name: 'X',
                unit_of_measurement: null,
                normal_reference_range: null,
                test_type: { id: 'tt1', test_name: 'CBC' },
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        baseRequest({
          id: 'req2',
          notes: JSON.stringify({ orderedTestTypeIds: [] }),
        }),
      );
    prisma.testTypes.findMany.mockResolvedValue([]);

    const report = await ops.getVisitLabReport('visit-1');
    expect(report.released).toBe(true);
    expect(report.releasedRequestCount).toBe(1);
    expect(report.lines).toHaveLength(1);
    expect(report.observations).toBe('Obs');
  });

  it('updateRequestFindings merges notes and preserves release metadata', async () => {
    prisma.laboratoryRequests.findFirst
      .mockResolvedValueOnce({
        id: 'req1',
        notes: JSON.stringify({
          orderedTestTypeIds: ['tt1'],
          visitId: 'v1',
          releasedToDoctorAt: '2026-08-01T00:00:00.000Z',
          releasedToDoctorBy: 'u9',
        }),
      })
      .mockResolvedValueOnce(baseRequest());
    prisma.laboratoryRequests.update.mockResolvedValue({});
    prisma.testTypes.findMany.mockResolvedValue([]);

    const result = await ops.updateRequestFindings('req1', {
      observations: '  new obs  ',
      conclusion: 'ok',
      evidenceName: 'img.png',
      text: 'note',
      actorUserId: 'u1',
    });
    expect(result.id).toBe('req1');
    expect(prisma.laboratoryRequests.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          notes: expect.stringContaining('releasedToDoctorAt'),
        }),
      }),
    );

    prisma.laboratoryRequests.findFirst.mockResolvedValue(null);
    await expect(
      ops.updateRequestFindings('missing', { actorUserId: 'u1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resultsSummary and listResultBundles', async () => {
    prisma.laboratoryRequests.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const summary = await ops.resultsSummary();
    expect(summary).toEqual({
      total: 5,
      completedToday: 1,
      completedThisWeek: 2,
    });

    await expect(
      ops.listResultBundles({ status: 'NOPE' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.laboratoryRequests.findMany.mockResolvedValue([
      baseRequest({
        laboratory_results_request_id: [
          {
            id: 'res1',
            request_id: 'req1',
            parameter_id: 'p1',
            result_value: '1',
            interpretation: 'CRITICAL',
            notes: null,
            performed_by: null,
            performed_at: null,
            verified_by: null,
            verified_at: null,
            parameter: {
              parameter_name: 'X',
              unit_of_measurement: null,
              normal_reference_range: null,
              test_type: { id: 'tt1', test_name: 'CBC' },
            },
          },
        ],
      }),
    ]);
    prisma.laboratoryRequests.count.mockResolvedValue(1);
    const bundles = await ops.listResultBundles({
      search: 'LAB',
      status: 'completed',
      criticalOnly: true,
      unverifiedOnly: true,
    });
    expect(bundles.items[0].criticalCount).toBe(1);
    expect(bundles.items[0].panels).toContain('CBC');
  });

  it('lists and gets samples/results with validation', async () => {
    await expect(
      ops.listSamples({ status: 'WEIRD' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.samples.findMany.mockResolvedValue([
      {
        id: 's1',
        sample_id: 'S-1',
        request_id: 'req1',
        patient_id: 'p1',
        sample_type: 'Blood',
        collected_date: new Date('2026-08-01'),
        collected_at: new Date('2026-08-01T10:00:00Z'),
        collected_by: 'n1',
        status: 'REGISTERED',
        notes: null,
        request: { request_number: 'LAB-1', status: 'PENDING' },
        patient: {
          patient_number: 'MRN1',
          user: { core_profiles_user_id: profile() },
        },
        rel_collected_by: {
          user: { core_profiles_user_id: profile('N', 'One') },
        },
      },
    ]);
    prisma.samples.count.mockResolvedValue(1);
    const samples = await ops.listSamples({
      requestId: 'req1',
      patientId: 'p1',
      status: 'registered',
      search: 'Blood',
    });
    expect(samples.items[0].sampleId).toBe('S-1');

    prisma.samples.findFirst.mockResolvedValue(samples.items[0] as any);
    // getSample needs raw row shape
    prisma.samples.findFirst.mockResolvedValue({
      id: 's1',
      sample_id: 'S-1',
      request_id: 'req1',
      patient_id: 'p1',
      sample_type: 'Blood',
      collected_date: new Date('2026-08-01'),
      collected_at: new Date('2026-08-01T10:00:00Z'),
      collected_by: 'n1',
      status: 'REGISTERED',
      notes: null,
      request: { request_number: 'LAB-1', status: 'PENDING' },
      patient: {
        patient_number: 'MRN1',
        user: { core_profiles_user_id: profile() },
      },
      rel_collected_by: {
        user: { core_profiles_user_id: profile('N', 'One') },
      },
    });
    expect((await ops.getSample('s1')).id).toBe('s1');
    prisma.samples.findFirst.mockResolvedValue(null);
    await expect(ops.getSample('x')).rejects.toBeInstanceOf(NotFoundException);

    prisma.results.findMany.mockResolvedValue([
      {
        id: 'res1',
        request_id: 'req1',
        parameter_id: 'p1',
        result_value: '1',
        interpretation: 'HIGH',
        notes: null,
        performed_by: null,
        performed_at: null,
        verified_by: null,
        verified_at: null,
        parameter: {
          parameter_name: 'X',
          unit_of_measurement: null,
          normal_reference_range: null,
          test_type: { id: 'tt1', test_name: 'CBC' },
        },
        request: {
          request_number: 'LAB-1',
          patient: {
            patient_number: 'MRN1',
            user: { core_profiles_user_id: profile() },
          },
        },
      },
    ]);
    prisma.results.count.mockResolvedValue(1);
    const results = await ops.listResults({
      requestId: 'req1',
      criticalOnly: false,
      unverifiedOnly: true,
    });
    expect(results.items[0].id).toBe('res1');
  });

  it('encodes and parses ordered test notes', () => {
    const raw = ops.encodeNotes(['a', 'b'], 'fasting');
    expect(raw).toContain('orderedTestTypeIds');
    const parsed = ops.parseNotes(raw);
    expect(parsed.orderedTestTypeIds).toEqual(['a', 'b']);
    expect(parsed.text).toBe('fasting');
    expect(ops.parseNotes('plain notes').text).toBe('plain notes');
    expect(ops.encodeNotes([], null)).toBeNull();
  });

  it('preserves visitId and release metadata across encode/parse', () => {
    const raw = ops.encodeNotesPayload({
      orderedTestTypeIds: ['tt1'],
      text: 'note',
      visitId: 'visit-uuid',
      doctorName: 'Dr X',
      comments: 'c',
      observations: 'o',
      conclusion: 'k',
      evidenceName: 'e.png',
      tests: [{ name: 'CBC', unit: 'g/dL' }],
      releasedToDoctorAt: '2026-08-13T12:00:00.000Z',
      releasedToDoctorBy: 'user-1',
    });
    const parsed = ops.parseNotes(raw!);
    expect(parsed.visitId).toBe('visit-uuid');
    expect(parsed.doctorName).toBe('Dr X');
    expect(parsed.tests?.[0]?.name).toBe('CBC');
    expect(parsed.releasedToDoctorAt).toBe('2026-08-13T12:00:00.000Z');
    expect(parsed.releasedToDoctorBy).toBe('user-1');
  });

  it('parses legacy notes with tests[].testTypeId and doctorNotes', () => {
    const legacy = JSON.stringify({
      tests: [{ name: 'CBC', testTypeId: 'tt9' }],
      doctorNotes: 'legacy',
    });
    const parsed = ops.parseNotes(legacy);
    expect(parsed.orderedTestTypeIds).toEqual(['tt9']);
    expect(parsed.text).toBe('legacy');
  });

  it('never exposes raw JSON blobs as clinical notes text', () => {
    const junk = JSON.stringify({ foo: 'bar', data: { nested: true } });
    const parsed = ops.parseNotes(junk);
    expect(parsed.text).toBeUndefined();
    expect(JSON.stringify(parsed)).not.toContain('"foo"');

    const brokenJsonLooking = '{not-valid-json';
    expect(ops.parseNotes(brokenJsonLooking).text).toBeUndefined();

    const withText = JSON.stringify({
      orderedTestTypeIds: [],
      text: 'Patient fasting',
    });
    expect(ops.parseNotes(withText).text).toBe('Patient fasting');
  });

  it('mapRequest surfaces human-readable notes only', () => {
    const mapped = (ops as any).mapRequest({
      id: 'req1',
      request_number: 'LR-1',
      patient_id: 'p1',
      requesting_doctor_id: null,
      consultation_id: null,
      priority: 'ROUTINE',
      request_date: new Date('2026-08-20T10:00:00Z'),
      status: 'PENDING',
      notes: JSON.stringify({ orderedTestTypeIds: ['tt1'], visitId: 'v1' }),
      requested_by: 'u1',
      patient: {
        patient_number: 'MRN-1',
        user: {
          core_profiles_user_id: [{ first_name: 'A', last_name: 'B' }],
        },
      },
      requesting_doctor: null,
      consultation: null,
    });
    expect(mapped.notes).toBeNull();
    expect(mapped.visitId).toBe('v1');
    expect(String(mapped.notes ?? '')).not.toMatch(/^\s*[{\[]/);
  });

  it('resolveOrderedPanels resolves names when ids missing', async () => {
    const notes = JSON.stringify({ tests: [{ name: 'CBC' }] });
    prisma.testTypes.findMany
      .mockResolvedValueOnce([{ id: 'tt1' }])
      .mockResolvedValueOnce([
        baseTestType({
          laboratory_test_parameters_test_type_id: [
            {
              id: 'p1',
              test_type_id: 'tt1',
              parameter_name: 'Hb',
              unit_of_measurement: null,
              normal_reference_range: null,
              display_order: 0,
              is_active: true,
            },
          ],
        }),
      ]);
    const panels = await ops.resolveOrderedPanels(notes);
    expect(panels[0].testName).toBe('CBC');
    expect(panels[0].parameters).toHaveLength(1);

    expect(await ops.resolveOrderedPanels(null)).toEqual([]);
  });

  it('listClinicalServices filters system fees and kind', async () => {
    prisma.services.count.mockResolvedValue(10);
    prisma.services.findMany.mockResolvedValue([
      {
        id: '1',
        service_code: 'CONSULT',
        service_name: 'Consult',
        category: 'General',
        category_id: null,
        description: null,
        standard_price: { toString: () => '100' },
        is_active: true,
      },
      {
        id: '2',
        service_code: 'PROC1',
        service_name: 'Dressing',
        category: 'Procedure',
        category_id: 'c1',
        description: null,
        standard_price: { toString: () => '200' },
        is_active: true,
      },
      {
        id: '3',
        service_code: 'SURG1',
        service_name: 'Appendectomy',
        category: 'Surgery',
        category_id: 'c2',
        description: null,
        standard_price: { toString: () => '5000' },
        is_active: true,
      },
    ]);
    const listed = await ops.listClinicalServices({
      search: 'a',
      kind: 'surgery',
      active: true,
      take: 50,
    });
    expect(listed.items.every((i) => i.kind === 'surgery')).toBe(true);
    expect(listed.items.find((i) => i.serviceCode === 'CONSULT')).toBeUndefined();
  });

  it('createClinicalService success and validation', async () => {
    await expect(
      ops.createClinicalService({
        serviceCode: '  ',
        serviceName: 'X',
        standardPrice: 1,
        actorUserId: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      ops.createClinicalService({
        serviceCode: 'LAB',
        serviceName: 'X',
        standardPrice: 1,
        actorUserId: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      ops.createClinicalService({
        serviceCode: 'OK1',
        serviceName: '  ',
        standardPrice: 1,
        actorUserId: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.services.create.mockResolvedValue({
      id: 'svc1',
      service_code: 'PROC1',
      service_name: 'Dressing',
      category: 'Procedure',
      category_id: 'scat1',
      description: null,
      standard_price: { toString: () => '100' },
      is_active: true,
    });
    const created = await ops.createClinicalService({
      serviceCode: 'proc1',
      serviceName: 'Dressing',
      category: 'Procedure',
      standardPrice: '100',
      actorUserId: 'u1',
    });
    expect(created.serviceCode).toBe('PROC1');

    const { Prisma } = require('../../../generated/prisma');
    prisma.services.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      ops.createClinicalService({
        serviceCode: 'PROC1',
        serviceName: 'Dressing',
        standardPrice: 1,
        actorUserId: 'u1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    prisma.services.create.mockRejectedValue(new Error('svc fail'));
    await expect(
      ops.createClinicalService({
        serviceCode: 'PROC9',
        serviceName: 'X',
        standardPrice: 1,
        actorUserId: 'u1',
      }),
    ).rejects.toThrow('svc fail');
  });

  it('updateClinicalService success and guards', async () => {
    prisma.services.findUnique.mockResolvedValue(null);
    await expect(
      ops.updateClinicalService('x', { actorUserId: 'u1' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.services.findUnique.mockResolvedValue({
      id: 'svc1',
      service_code: 'CONSULT',
      category: null,
      service_name: 'Consult',
      revenue_account_id: null,
      is_active: true,
    });
    await expect(
      ops.updateClinicalService('svc1', { actorUserId: 'u1' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.services.findUnique.mockResolvedValue({
      id: 'svc1',
      service_code: 'PROC1',
      category: 'Procedure',
      service_name: 'Dressing',
      revenue_account_id: null,
      is_active: true,
      category_id: null,
    });
    prisma.services.update.mockResolvedValue({
      id: 'svc1',
      service_code: 'PROC1',
      service_name: 'Dressing Plus',
      category: 'Surgery',
      category_id: 'scat1',
      description: 'd',
      standard_price: { toString: () => '150' },
      is_active: true,
    });
    prisma.accounts.findUnique.mockResolvedValue({
      id: 'acc1',
      is_active: true,
      is_postable: true,
      account_type: 'REVENUE',
    });
    const updated = await ops.updateClinicalService('svc1', {
      serviceName: 'Dressing Plus',
      category: 'Surgery',
      description: 'd',
      standardPrice: 150,
      isActive: true,
      actorUserId: 'u1',
    });
    expect(updated.serviceName).toBe('Dressing Plus');
    expect(updated.kind).toBe('surgery');
  });

  it('resolveServiceRevenueAccountId returns null for inactive account', async () => {
    prisma.accounts.findUnique.mockResolvedValue({
      id: 'acc1',
      is_active: false,
      is_postable: true,
      account_type: 'REVENUE',
    });
    prisma.services.create.mockResolvedValue({
      id: 'svc1',
      service_code: 'PROC2',
      service_name: 'X',
      category: null,
      category_id: null,
      description: null,
      standard_price: { toString: () => '0' },
      is_active: true,
    });
    await ops.createClinicalService({
      serviceCode: 'PROC2',
      serviceName: 'X',
      standardPrice: 0,
      actorUserId: 'u1',
    });
    expect(prisma.services.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ revenue_account_id: null }),
      }),
    );
  });
});
