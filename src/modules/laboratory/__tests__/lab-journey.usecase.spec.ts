/**
 * Laboratory journey — request → sample → result → verify.
 */

import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LabJourneyUseCase } from '../use-cases/lab-journey.usecase';
import { LabOperationsUseCase } from '../use-cases/lab-operations.usecase';

describe('LabJourneyUseCase', () => {
  const events = { emit: jest.fn() } as unknown as EventEmitter2;
  const audit = { recordMutation: jest.fn().mockResolvedValue(undefined) };
  let prisma: any;
  let ops: LabOperationsUseCase;
  let journey: LabJourneyUseCase;

  beforeEach(() => {
    prisma = {
      patients: { findFirst: jest.fn() },
      testTypes: { findMany: jest.fn().mockResolvedValue([]) },
      testParameters: { findFirst: jest.fn(), findMany: jest.fn() },
      staffProfiles: { findFirst: jest.fn() },
      consultations: { findFirst: jest.fn() },
      laboratoryRequests: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      samples: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      results: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
        fn(prisma),
      ),
    };
    ops = {
      encodeNotes: jest.fn((ids: string[], text?: string) =>
        JSON.stringify({ orderedTestTypeIds: ids, text }),
      ),
      encodeNotesPayload: jest.fn((payload: Record<string, unknown>) =>
        JSON.stringify(payload),
      ),
      parseNotes: jest.fn((raw: string | null) => {
        if (!raw) return { orderedTestTypeIds: [] };
        try {
          return JSON.parse(raw);
        } catch {
          return { orderedTestTypeIds: [], text: raw };
        }
      }),
      getRequest: jest.fn().mockResolvedValue({ id: 'r1', status: 'PENDING' }),
      getSample: jest.fn().mockResolvedValue({ id: 's1', status: 'REGISTERED' }),
      listResults: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'res1',
            interpretation: 'NORMAL',
            isVerified: false,
          },
        ],
      }),
    } as unknown as LabOperationsUseCase;
    prisma.user = { findFirst: jest.fn() };
    prisma.outpatientVisits = { updateMany: jest.fn().mockResolvedValue({ count: 1 }), findFirst: jest.fn() };
    prisma.$queryRaw = jest.fn().mockResolvedValue([]);
    journey = new LabJourneyUseCase(prisma, events, audit as any, ops);
    jest.clearAllMocks();
  });

  it('creates a pending request with ordered test types', async () => {
    prisma.patients.findFirst.mockResolvedValue({ id: 'p1' });
    prisma.testTypes.findMany.mockResolvedValue([{ id: 'tt1' }]);
    prisma.laboratoryRequests.create.mockResolvedValue({
      id: 'r1',
      status: 'PENDING',
    });

    const req = await journey.createRequest({
      patientId: 'p1',
      requestedBy: 'u1',
      testTypeIds: ['tt1'],
      priority: 'STAT',
    });
    expect(req.status).toBe('PENDING');
    expect(prisma.laboratoryRequests.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          priority: 'STAT',
          status: 'PENDING',
        }),
      }),
    );
  });

  it('rejects invalid priority', async () => {
    prisma.patients.findFirst.mockResolvedValue({ id: 'p1' });
    await expect(
      journey.createRequest({
        patientId: 'p1',
        requestedBy: 'u1',
        priority: 'ASAP',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('registers sample as REGISTERED and moves request to IN_PROGRESS', async () => {
    prisma.laboratoryRequests.findFirst.mockResolvedValue({
      id: 'r1',
      patient_id: 'p1',
      status: 'PENDING',
    });
    prisma.staffProfiles.findFirst.mockResolvedValue({ id: 'staff1' });
    prisma.samples.create.mockResolvedValue({
      id: 's1',
      status: 'REGISTERED',
    });
    prisma.laboratoryRequests.update.mockResolvedValue({
      status: 'IN_PROGRESS',
    });

    const sample = await journey.collectSample({
      requestId: 'r1',
      collectedBy: 'staff1',
    });
    expect(sample.status).toBe('REGISTERED');
    expect(prisma.samples.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REGISTERED' }),
      }),
    );
    expect(prisma.laboratoryRequests.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { status: 'IN_PROGRESS' },
    });
  });

  it('rejects sample collection for cancelled request', async () => {
    prisma.laboratoryRequests.findFirst.mockResolvedValue({
      id: 'r1',
      status: 'CANCELLED',
    });
    prisma.staffProfiles.findFirst.mockResolvedValue({ id: 'staff1' });
    await expect(
      journey.collectSample({ requestId: 'r1', collectedBy: 'staff1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects illegal sample status transition', async () => {
    prisma.samples.findFirst.mockResolvedValue({
      id: 's1',
      status: 'COMPLETED',
      patient_id: 'p1',
      request: { patient_id: 'p1', status: 'IN_PROGRESS' },
    });
    await expect(
      journey.updateSampleStatus({
        sampleId: 's1',
        status: 'REGISTERED',
        actorUserId: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enters result with interpretation validation', async () => {
    prisma.laboratoryRequests.findFirst.mockResolvedValue({
      id: 'r1',
      status: 'IN_PROGRESS',
      notes: JSON.stringify({ orderedTestTypeIds: ['tt1'] }),
    });
    prisma.testParameters.findFirst.mockResolvedValue({
      id: 'param1',
      test_type_id: 'tt1',
      is_active: true,
    });
    prisma.results.findFirst.mockResolvedValue(null);
    prisma.results.create.mockResolvedValue({ id: 'res1' });
    prisma.samples.updateMany.mockResolvedValue({ count: 1 });

    const result = await journey.enterResult({
      requestId: 'r1',
      parameterId: 'param1',
      resultValue: '12.5',
      interpretation: 'HIGH',
      performedBy: 'u1',
    });
    expect(result.id).toBe('res1');
    expect(events.emit).toHaveBeenCalled();
  });

  it('rejects invalid interpretation', async () => {
    prisma.laboratoryRequests.findFirst.mockResolvedValue({
      id: 'r1',
      status: 'IN_PROGRESS',
      notes: null,
    });
    await expect(
      journey.enterResult({
        requestId: 'r1',
        parameterId: 'param1',
        resultValue: '1',
        interpretation: 'WEIRD',
        performedBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('verifies result and completes when all ordered params verified', async () => {
    prisma.results.findFirst.mockResolvedValue({
      id: 'res1',
      performed_at: new Date(),
      verified_at: null,
      interpretation: 'NORMAL',
    });
    prisma.laboratoryRequests.findFirst.mockResolvedValue({
      id: 'r1',
      status: 'IN_PROGRESS',
      notes: JSON.stringify({ orderedTestTypeIds: ['tt1'] }),
    });
    prisma.results.update.mockResolvedValue({});
    prisma.results.findMany.mockResolvedValue([
      { parameter_id: 'param1', verified_at: new Date() },
    ]);
    prisma.testParameters.findMany.mockResolvedValue([{ id: 'param1' }]);
    prisma.laboratoryRequests.update.mockResolvedValue({
      status: 'COMPLETED',
    });
    prisma.samples.updateMany.mockResolvedValue({ count: 1 });
    (ops.getRequest as jest.Mock).mockResolvedValue({
      id: 'r1',
      status: 'COMPLETED',
    });

    const done = await journey.verifyAndComplete({
      requestId: 'r1',
      resultId: 'res1',
      verifiedBy: 'u1',
    });
    expect(done.status).toBe('COMPLETED');
  });

  it('releases completed request to doctor and advances visit stage', async () => {
    prisma.laboratoryRequests.findFirst.mockResolvedValue({
      id: 'r1',
      status: 'COMPLETED',
      request_number: 'LAB-VISIT001',
      notes: JSON.stringify({
        orderedTestTypeIds: ['tt1'],
        visitId: 'visit-1',
      }),
    });
    prisma.outpatientVisits.findFirst.mockResolvedValue({ id: 'visit-1' });
    prisma.laboratoryRequests.update.mockResolvedValue({});
    prisma.outpatientVisits.updateMany.mockResolvedValue({ count: 1 });
    (ops.getRequest as jest.Mock).mockResolvedValue({
      id: 'r1',
      status: 'COMPLETED',
      releasedToDoctor: true,
    });

    const released = await journey.releaseToDoctor({
      requestId: 'r1',
      actorUserId: 'tech-1',
    });
    expect(released.releasedToDoctor).toBe(true);
    expect(ops.encodeNotesPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        visitId: 'visit-1',
        releasedToDoctorBy: 'tech-1',
      }),
    );
    expect(prisma.outpatientVisits.updateMany).toHaveBeenCalledWith({
      where: { id: 'visit-1', stage: 'LAB_PENDING' },
      data: { stage: 'RESULTS_READY' },
    });
    expect(events.emit).toHaveBeenCalledWith(
      'lab.result.released',
      expect.objectContaining({ requestId: 'r1', visitId: 'visit-1' }),
    );
  });

  it('recovers visitId from LAB- request number when notes lost it', async () => {
    const visitId = '4a49d555-5c81-4455-8dfa-32a0e664c124';
    prisma.laboratoryRequests.findFirst.mockResolvedValue({
      id: 'r1',
      status: 'COMPLETED',
      request_number: 'LAB-4A49D555',
      notes: JSON.stringify({
        orderedTestTypeIds: ['tt1'],
        releasedToDoctorAt: '2026-08-13T12:00:00.000Z',
        releasedToDoctorBy: 'tech-1',
      }),
    });
    prisma.outpatientVisits.findFirst.mockResolvedValue(null);
    prisma.$queryRaw.mockResolvedValue([{ id: visitId }]);
    prisma.laboratoryRequests.update.mockResolvedValue({});
    prisma.outpatientVisits.updateMany.mockResolvedValue({ count: 1 });
    (ops.getRequest as jest.Mock).mockResolvedValue({
      id: 'r1',
      status: 'COMPLETED',
      releasedToDoctor: true,
      visitId,
    });

    await journey.releaseToDoctor({
      requestId: 'r1',
      actorUserId: 'tech-1',
    });

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(ops.encodeNotesPayload).toHaveBeenCalledWith(
      expect.objectContaining({ visitId }),
    );
    expect(prisma.outpatientVisits.updateMany).toHaveBeenCalledWith({
      where: { id: visitId, stage: 'LAB_PENDING' },
      data: { stage: 'RESULTS_READY' },
    });
  });

  it('cancels open request and related samples', async () => {
    prisma.laboratoryRequests.findFirst.mockResolvedValue({
      id: 'r1',
      status: 'PENDING',
    });
    (ops.getRequest as jest.Mock).mockResolvedValue({
      id: 'r1',
      status: 'CANCELLED',
    });
    const cancelled = await journey.cancelRequest('r1', 'u1');
    expect(cancelled.status).toBe('CANCELLED');
    expect(prisma.laboratoryRequests.update).toHaveBeenCalled();
  });

  it('validates doctor, consultation, and test types on createRequest', async () => {
    prisma.patients.findFirst.mockResolvedValue({ id: 'p1' });
    prisma.testTypes.findMany.mockResolvedValue([]);
    await expect(
      journey.createRequest({
        patientId: 'p1',
        requestedBy: 'u1',
        testTypeIds: ['tt-missing'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.testTypes.findMany.mockResolvedValue([{ id: 'tt1' }]);
    prisma.staffProfiles.findFirst.mockResolvedValue(null);
    await expect(
      journey.createRequest({
        patientId: 'p1',
        requestedBy: 'u1',
        requestingDoctorId: 'doc-x',
        testTypeIds: ['tt1'],
      }),
    ).rejects.toThrow(/Requesting doctor/);

    prisma.staffProfiles.findFirst.mockResolvedValue({ id: 'doc-1' });
    prisma.consultations.findFirst.mockResolvedValue(null);
    await expect(
      journey.createRequest({
        patientId: 'p1',
        requestedBy: 'u1',
        requestingDoctorId: 'doc-1',
        consultationId: 'c-missing',
        testTypeIds: ['tt1'],
      }),
    ).rejects.toThrow(/Consultation not found/);
  });

  it('rejects cancelling completed requests and is idempotent for cancelled', async () => {
    prisma.laboratoryRequests.findFirst.mockResolvedValue({
      id: 'r1',
      status: 'COMPLETED',
    });
    await expect(journey.cancelRequest('r1', 'u1')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    prisma.laboratoryRequests.findFirst.mockResolvedValue({
      id: 'r1',
      status: 'CANCELLED',
    });
    (ops.getRequest as jest.Mock).mockResolvedValue({
      id: 'r1',
      status: 'CANCELLED',
    });
    await expect(journey.cancelRequest('r1', 'u1')).resolves.toMatchObject({
      status: 'CANCELLED',
    });
  });

  it('advances sample status and returns early when already at target', async () => {
    prisma.samples.findFirst.mockResolvedValue({
      id: 's1',
      status: 'REGISTERED',
      patient_id: 'p1',
      request: { patient_id: 'p1', status: 'IN_PROGRESS' },
    });
    prisma.samples.update.mockResolvedValue({});
    (ops.getSample as jest.Mock).mockResolvedValue({
      id: 's1',
      status: 'IN_PROGRESS',
    });

    const moved = await journey.updateSampleStatus({
      sampleId: 's1',
      status: 'IN_PROGRESS',
      actorUserId: 'u1',
      notes: 'processing',
    });
    expect(moved.status).toBe('IN_PROGRESS');
    expect(prisma.samples.update).toHaveBeenCalled();

    prisma.samples.findFirst.mockResolvedValue({
      id: 's1',
      status: 'IN_PROGRESS',
      patient_id: 'p1',
      request: { patient_id: 'p1', status: 'IN_PROGRESS' },
    });
    await journey.updateSampleStatus({
      sampleId: 's1',
      status: 'IN_PROGRESS',
      actorUserId: 'u1',
    });
    expect(ops.getSample).toHaveBeenCalled();
  });

  it('enters result batches and corrects verified results', async () => {
    prisma.laboratoryRequests.findFirst.mockResolvedValue({
      id: 'r1',
      status: 'IN_PROGRESS',
      notes: JSON.stringify({ orderedTestTypeIds: ['tt1'] }),
    });
    prisma.testParameters.findFirst.mockResolvedValue({
      id: 'param1',
      test_type_id: 'tt1',
      is_active: true,
    });
    prisma.results.findFirst.mockResolvedValue(null);
    prisma.results.create.mockResolvedValue({ id: 'res1' });
    prisma.samples.updateMany.mockResolvedValue({ count: 1 });
    (ops.listResults as jest.Mock).mockResolvedValue({
      items: [{ id: 'res1', interpretation: 'NORMAL' }],
    });

    const batch = await journey.enterResultsBatch({
      requestId: 'r1',
      performedBy: 'u1',
      lines: [{ parameterId: 'param1', resultValue: '10', interpretation: 'NORMAL' }],
    });
    expect(batch).toHaveLength(1);

    prisma.results.findFirst.mockResolvedValue({
      id: 'res1',
      request_id: 'r1',
    });
    prisma.laboratoryRequests.findFirst.mockResolvedValue({
      id: 'r1',
      status: 'COMPLETED',
    });
    prisma.results.update.mockResolvedValue({});
    (ops.listResults as jest.Mock).mockResolvedValue({
      items: [{ id: 'res1', interpretation: 'CRITICAL' }],
    });

    const corrected = await journey.correctResult({
      requestId: 'r1',
      resultId: 'res1',
      resultValue: '99',
      interpretation: 'CRITICAL',
      actorUserId: 'u1',
    });
    expect(corrected.interpretation).toBe('CRITICAL');
    expect(prisma.laboratoryRequests.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'IN_PROGRESS' },
      }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'lab.result.critical',
      expect.objectContaining({ resultId: 'res1' }),
    );
  });

  it('repairs released visit stages and auto-provisions staff profiles', async () => {
    prisma.laboratoryRequests.findMany = jest.fn().mockResolvedValue([
      {
        id: 'r1',
        request_number: 'LAB-AABBCCDD',
        notes: JSON.stringify({
          orderedTestTypeIds: ['tt1'],
          releasedToDoctorAt: '2026-08-01T00:00:00.000Z',
        }),
      },
    ]);
    prisma.outpatientVisits.findFirst.mockResolvedValue(null);
    prisma.$queryRaw.mockResolvedValue([
      { id: 'aabbccdd-0000-4000-8000-000000000001' },
    ]);
    prisma.laboratoryRequests.update.mockResolvedValue({});
    prisma.outpatientVisits.updateMany.mockResolvedValue({ count: 1 });

    const repaired = await journey.repairReleasedVisitStages('admin-1');
    expect(repaired.repaired).toBe(1);
    expect(audit.recordMutation).toHaveBeenCalled();

    prisma.staffProfiles.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.user.findFirst.mockResolvedValue({ id: 'user-lab-1' });
    prisma.staffProfiles.create = jest.fn().mockResolvedValue({
      id: 'staff-new',
      user_id: 'user-lab-1',
    });
    prisma.laboratoryRequests.findFirst.mockResolvedValue({
      id: 'r1',
      patient_id: 'p1',
      status: 'PENDING',
    });
    prisma.samples.create.mockResolvedValue({ id: 's1', status: 'REGISTERED' });

    await journey.collectSample({
      requestId: 'r1',
      collectedBy: 'user-lab-1',
    });
    expect(prisma.staffProfiles.create).toHaveBeenCalled();
  });

  it('rejects empty result batches and long sample types', async () => {
    await expect(
      journey.enterResultsBatch({
        requestId: 'r1',
        performedBy: 'u1',
        lines: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.staffProfiles.findFirst.mockResolvedValue({ id: 'staff1' });
    await expect(
      journey.collectSample({
        requestId: 'r1',
        collectedBy: 'staff1',
        sampleType: 'X'.repeat(51),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
