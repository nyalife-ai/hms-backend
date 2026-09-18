/**
 * RadiologyJourneyUseCase — request lifecycle state machine + audit trail.
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RadiologyJourneyUseCase } from '../use-cases/radiology-journey.usecase';
import { RadiologyOperationsUseCase } from '../use-cases/radiology-operations.usecase';

describe('RadiologyJourneyUseCase', () => {
  const events = { emit: jest.fn() } as unknown as EventEmitter2;
  const audit = { recordMutation: jest.fn().mockResolvedValue(undefined) };
  const ops = { getRequest: jest.fn().mockResolvedValue({ id: 'req1' }) } as unknown as RadiologyOperationsUseCase;
  let prisma: any;
  let journey: RadiologyJourneyUseCase;

  const baseRequest = {
    id: 'req1',
    status: 'PENDING',
    requesting_doctor: { user_id: 'doc-user-1' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      patients: { findFirst: jest.fn().mockResolvedValue({ id: 'p1' }) },
      scanTypes: { findFirst: jest.fn().mockResolvedValue({ id: 'st1' }) },
      staffProfiles: {
        findFirst: jest.fn().mockResolvedValue({ id: 'doc1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      consultations: { findFirst: jest.fn().mockResolvedValue({ id: 'c1' }) },
      radiologyRequests: {
        create: jest.fn().mockResolvedValue({ id: 'req1' }),
        findFirst: jest.fn().mockResolvedValue({ ...baseRequest }),
        update: jest.fn().mockResolvedValue({ ...baseRequest }),
      },
      findings: {
        create: jest.fn().mockResolvedValue({ id: 'f1' }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      reports: {
        create: jest.fn().mockResolvedValue({ id: 'rep1', status: 'DRAFT' }),
        findFirst: jest.fn(),
      },
      reportTemplates: { findFirst: jest.fn() },
    };
    journey = new RadiologyJourneyUseCase(prisma, events, audit as never, ops);
  });

  it('creates a request in PENDING and audits + emits request_created', async () => {
    const result = await journey.createRequest({
      patientId: 'p1',
      scanTypeId: 'st1',
      requestedBy: 'u1',
    });
    expect(prisma.radiologyRequests.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING', patient_id: 'p1' }),
      }),
    );
    expect(audit.recordMutation).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', entityType: 'radiology.requests' }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'radiology.request_created',
      expect.objectContaining({ payload: expect.objectContaining({ requestId: 'req1' }) }),
    );
    expect(result).toEqual({ id: 'req1' });
  });

  it('rejects an invalid priority', async () => {
    await expect(
      journey.createRequest({
        patientId: 'p1',
        scanTypeId: 'st1',
        requestedBy: 'u1',
        priority: 'WHENEVER',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404s when the patient does not exist', async () => {
    prisma.patients.findFirst.mockResolvedValue(null);
    await expect(
      journey.createRequest({ patientId: 'missing', scanTypeId: 'st1', requestedBy: 'u1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('walks PENDING -> SCHEDULED -> CHECKED_IN -> IN_PROGRESS -> COMPLETED', async () => {
    prisma.radiologyRequests.findFirst.mockResolvedValueOnce({ ...baseRequest, status: 'PENDING' });
    await journey.scheduleRequest('req1', { scheduledAt: '2026-06-01T09:00:00Z', actorUserId: 'u1' });
    expect(prisma.radiologyRequests.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SCHEDULED' }) }),
    );

    prisma.radiologyRequests.findFirst.mockResolvedValueOnce({ ...baseRequest, status: 'SCHEDULED' });
    await journey.checkIn('req1', 'u1');
    expect(prisma.radiologyRequests.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CHECKED_IN' }) }),
    );

    prisma.radiologyRequests.findFirst.mockResolvedValueOnce({ ...baseRequest, status: 'CHECKED_IN' });
    await journey.startExam('req1', 'u1');
    expect(prisma.radiologyRequests.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'IN_PROGRESS' }) }),
    );

    prisma.radiologyRequests.findFirst.mockResolvedValueOnce({ ...baseRequest, status: 'IN_PROGRESS' });
    await journey.completeExam('req1', 'u1');
    expect(prisma.radiologyRequests.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }),
    );

    expect(audit.recordMutation).toHaveBeenCalledTimes(4);
  });

  it('rejects starting an exam that is already completed', async () => {
    prisma.radiologyRequests.findFirst.mockResolvedValue({ ...baseRequest, status: 'COMPLETED' });
    await expect(journey.startExam('req1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects cancelling an already-finalized request', async () => {
    prisma.radiologyRequests.findFirst.mockResolvedValue({ ...baseRequest, status: 'FINALIZED' });
    await expect(
      journey.cancelRequest('req1', { actorUserId: 'u1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks no-show only from PENDING/SCHEDULED', async () => {
    prisma.radiologyRequests.findFirst.mockResolvedValue({ ...baseRequest, status: 'IN_PROGRESS' });
    await expect(journey.markNoShow('req1', 'u1')).rejects.toBeInstanceOf(BadRequestException);

    prisma.radiologyRequests.findFirst.mockResolvedValue({ ...baseRequest, status: 'SCHEDULED' });
    await journey.markNoShow('req1', 'u1');
    expect(prisma.radiologyRequests.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'NO_SHOW' }) }),
    );
  });

  it('enterFindings bumps COMPLETED -> REPORT_PENDING and audits the findings row', async () => {
    prisma.radiologyRequests.findFirst.mockResolvedValue({ ...baseRequest, status: 'COMPLETED' });
    await journey.enterFindings('req1', {
      radiologistId: 'rad1',
      findingsText: 'clear',
      actorUserId: 'u1',
    });
    expect(prisma.findings.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DRAFT', findings_text: 'clear' }),
      }),
    );
    expect(prisma.radiologyRequests.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'REPORT_PENDING' } }),
    );
  });

  it('enterFindings rejects an invalid status value', async () => {
    prisma.radiologyRequests.findFirst.mockResolvedValue({ ...baseRequest, status: 'REPORT_PENDING' });
    await expect(
      journey.enterFindings('req1', {
        radiologistId: 'rad1',
        status: 'BOGUS',
        actorUserId: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enterReport with finalize=true bumps REPORT_PENDING -> REPORTED', async () => {
    prisma.radiologyRequests.findFirst.mockResolvedValue({ ...baseRequest, status: 'REPORT_PENDING' });
    prisma.findings.findFirst.mockResolvedValue({ id: 'f1' });
    prisma.reports.create.mockResolvedValue({ id: 'rep1', status: 'FINAL' });

    await journey.enterReport('req1', {
      radiologistId: 'rad1',
      finalImpression: 'normal',
      finalize: true,
      actorUserId: 'u1',
    });

    expect(prisma.reports.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FINAL', finalized_by: 'u1' }),
      }),
    );
    expect(prisma.radiologyRequests.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'REPORTED', reported_at: expect.any(Date) } }),
    );
  });

  it('enterReport as a draft leaves the request at REPORT_PENDING', async () => {
    prisma.radiologyRequests.findFirst.mockResolvedValue({ ...baseRequest, status: 'REPORT_PENDING' });
    prisma.findings.findFirst.mockResolvedValue({ id: 'f1' });

    await journey.enterReport('req1', {
      radiologistId: 'rad1',
      finalImpression: 'pending review',
      actorUserId: 'u1',
    });

    expect(prisma.radiologyRequests.update).not.toHaveBeenCalled();
  });

  it('finalizeRequest requires REPORTED and emits report_ready with the referring doctor', async () => {
    prisma.radiologyRequests.findFirst
      .mockResolvedValueOnce({ ...baseRequest, status: 'REPORTED' })
      .mockResolvedValueOnce({ requesting_doctor: { user_id: 'doc-user-1' } });

    await journey.finalizeRequest('req1', 'u1');

    expect(prisma.radiologyRequests.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FINALIZED' }) }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'radiology.report_ready',
      expect.objectContaining({
        payload: expect.objectContaining({ requestId: 'req1', doctorUserId: 'doc-user-1' }),
      }),
    );
  });

  it('rejects finalizing a request that has not been reported yet', async () => {
    prisma.radiologyRequests.findFirst.mockResolvedValue({ ...baseRequest, status: 'REPORT_PENDING' });
    await expect(journey.finalizeRequest('req1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('amendReport requires a reason and an existing finalized report', async () => {
    prisma.radiologyRequests.findFirst.mockResolvedValue({ ...baseRequest, status: 'FINALIZED' });

    await expect(
      journey.amendReport('req1', {
        reportId: 'rep1',
        radiologistId: 'rad1',
        reason: '',
        actorUserId: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.reports.findFirst.mockResolvedValue(null);
    await expect(
      journey.amendReport('req1', {
        reportId: 'missing',
        radiologistId: 'rad1',
        reason: 'correction',
        actorUserId: 'u1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('amendReport creates a new AMENDED row pointing back at the original', async () => {
    prisma.radiologyRequests.findFirst.mockResolvedValue({ ...baseRequest, status: 'FINALIZED' });
    prisma.reports.findFirst.mockResolvedValue({
      id: 'rep1',
      status: 'FINAL',
      findings_id: 'f1',
      template_id: null,
      sections_data: null,
      final_impression: 'old',
      conclusion: 'old',
      recommendations: null,
      version: 1,
    });
    prisma.reports.create.mockResolvedValue({ id: 'rep2', status: 'AMENDED' });

    await journey.amendReport('req1', {
      reportId: 'rep1',
      radiologistId: 'rad1',
      finalImpression: 'corrected',
      reason: 'typo in impression',
      actorUserId: 'u1',
    });

    expect(prisma.reports.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'AMENDED',
          amends_report_id: 'rep1',
          version: 2,
          amendment_reason: 'typo in impression',
          final_impression: 'corrected',
        }),
      }),
    );
  });

  it('amendReport is only allowed once the request is FINALIZED', async () => {
    prisma.radiologyRequests.findFirst.mockResolvedValue({ ...baseRequest, status: 'REPORTED' });
    await expect(
      journey.amendReport('req1', {
        reportId: 'rep1',
        radiologistId: 'rad1',
        reason: 'correction',
        actorUserId: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
