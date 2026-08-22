/**
 * Laboratory journey — request → sample → results → verify.
 * Source of truth: db.sql laboratory.*
 */

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { HmsAuditWriter } from '../../audit/hms-audit.writer';
import {
  LAB_INTERPRETATIONS,
  LAB_PRIORITIES,
  LAB_SAMPLE_STATUSES,
  LabOperationsUseCase,
} from './lab-operations.usecase';

export const LAB_EVENTS = {
  REQUESTED: 'lab.request.created',
  REQUEST_CANCELLED: 'lab.request.cancelled',
  SAMPLE_COLLECTED: 'lab.sample.collected',
  SAMPLE_STATUS: 'lab.sample.status',
  RESULT_ENTERED: 'lab.result.entered',
  RESULT_CORRECTED: 'lab.result.corrected',
  RESULT_VERIFIED: 'lab.result.verified',
  RESULT_CRITICAL: 'lab.result.critical',
  REQUEST_COMPLETED: 'lab.request.completed',
  /** Verified results released for doctor retrieval (no WebSocket yet) */
  RESULT_RELEASED: 'lab.result.released',
} as const;

const SAMPLE_TRANSITIONS: Record<string, string[]> = {
  REGISTERED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['PENDING_RESULTS', 'CANCELLED'],
  PENDING_RESULTS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

@Injectable()
export class LabJourneyUseCase {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly audit: HmsAuditWriter,
    private readonly ops: LabOperationsUseCase,
  ) {}

  public async createRequest(input: {
    patientId: string;
    requestingDoctorId?: string;
    consultationId?: string;
    requestedBy: string;
    testTypeIds?: string[];
    /** @deprecated prefer testTypeIds */
    testTypeId?: string;
    priority?: string;
    notes?: string;
  }) {
    const patient = await this.prisma.patients.findFirst({
      where: { id: input.patientId, deleted_at: null },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    const priority = (input.priority || 'NORMAL').toUpperCase();
    if (!LAB_PRIORITIES.includes(priority as (typeof LAB_PRIORITIES)[number])) {
      throw new BadRequestException(
        `priority must be one of ${LAB_PRIORITIES.join(', ')}`,
      );
    }

    const testTypeIds = [
      ...new Set(
        [
          ...(input.testTypeIds ?? []),
          ...(input.testTypeId ? [input.testTypeId] : []),
        ].filter(Boolean),
      ),
    ];
    if (testTypeIds.length) {
      const found = await this.prisma.testTypes.findMany({
        where: { id: { in: testTypeIds }, is_active: true },
        select: { id: true },
      });
      if (found.length !== testTypeIds.length) {
        throw new BadRequestException('One or more test types are invalid');
      }
    }

    if (input.requestingDoctorId) {
      const doctor = await this.prisma.staffProfiles.findFirst({
        where: { id: input.requestingDoctorId, deleted_at: null },
      });
      if (!doctor) throw new NotFoundException('Requesting doctor not found');
    }

    if (input.consultationId) {
      const consult = await this.prisma.consultations.findFirst({
        where: { id: input.consultationId },
      });
      if (!consult) throw new NotFoundException('Consultation not found');
    }

    const requestNumber = `LAB-${Date.now().toString(36).toUpperCase()}`;
    const notes = this.ops.encodeNotes(testTypeIds, input.notes);

    const request = await this.prisma.laboratoryRequests.create({
      data: {
        request_number: requestNumber,
        patient_id: input.patientId,
        requesting_doctor_id: input.requestingDoctorId || null,
        consultation_id: input.consultationId || null,
        requested_by: input.requestedBy,
        priority,
        status: 'PENDING',
        notes,
      },
    });

    await this.audit.recordMutation({
      userId: input.requestedBy,
      action: 'CREATE',
      entityType: 'laboratory.requests',
      entityId: request.id,
    });
    this.events.emit(LAB_EVENTS.REQUESTED, {
      requestId: request.id,
      priority: request.priority,
      patientId: request.patient_id,
    });
    return this.ops.getRequest(request.id);
  }

  public async cancelRequest(requestId: string, actorUserId: string) {
    const request = await this.prisma.laboratoryRequests.findFirst({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Lab request not found');
    if (request.status === 'COMPLETED') {
      throw new BadRequestException('Cannot cancel a completed request');
    }
    if (request.status === 'CANCELLED') {
      return this.ops.getRequest(requestId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.laboratoryRequests.update({
        where: { id: requestId },
        data: { status: 'CANCELLED' },
      });
      await tx.samples.updateMany({
        where: {
          request_id: requestId,
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
        data: { status: 'CANCELLED' },
      });
    });

    await this.audit.recordMutation({
      userId: actorUserId,
      action: 'UPDATE',
      entityType: 'laboratory.requests',
      entityId: requestId,
      newValues: { status: 'CANCELLED' },
    });
    this.events.emit(LAB_EVENTS.REQUEST_CANCELLED, { requestId });
    return this.ops.getRequest(requestId);
  }

  public async collectSample(input: {
    requestId: string;
    collectedBy: string;
    sampleType?: string;
    notes?: string;
    collectedDate?: string;
  }) {
    const staff = await this.resolveStaff(input.collectedBy);
    const sampleType = (input.sampleType || 'BLOOD').trim();
    if (!sampleType) throw new BadRequestException('sampleType is required');
    if (sampleType.length > 50) {
      throw new BadRequestException('sampleType max length is 50');
    }

    const samplePk = await this.prisma.$transaction(async (tx) => {
      const request = await tx.laboratoryRequests.findFirst({
        where: { id: input.requestId },
      });
      if (!request) throw new NotFoundException('Lab request not found');
      if (['CANCELLED', 'COMPLETED'].includes(request.status)) {
        throw new BadRequestException(
          `Cannot collect sample for status ${request.status}`,
        );
      }

      const sampleId = `SMP-${Date.now().toString(36).toUpperCase()}`;
      const now = new Date();
      const collectedDate = input.collectedDate
        ? new Date(input.collectedDate)
        : now;
      if (Number.isNaN(collectedDate.getTime())) {
        throw new BadRequestException('collectedDate is invalid');
      }

      const sample = await tx.samples.create({
        data: {
          request_id: request.id,
          patient_id: request.patient_id,
          sample_id: sampleId,
          sample_type: sampleType,
          collected_date: collectedDate,
          collected_by: staff.id,
          collected_at: now,
          status: 'REGISTERED',
          notes: input.notes?.trim() || null,
        },
      });

      if (request.status === 'PENDING') {
        await tx.laboratoryRequests.update({
          where: { id: request.id },
          data: { status: 'IN_PROGRESS' },
        });
      }

      return sample.id;
    });

    await this.audit.recordMutation({
      userId: input.collectedBy,
      action: 'CREATE',
      entityType: 'laboratory.samples',
      entityId: samplePk,
    });
    this.events.emit(LAB_EVENTS.SAMPLE_COLLECTED, {
      requestId: input.requestId,
      sampleId: samplePk,
    });
    return this.ops.getSample(samplePk);
  }

  public async updateSampleStatus(input: {
    sampleId: string;
    status: string;
    actorUserId: string;
    notes?: string;
  }) {
    const next = input.status.toUpperCase();
    if (!LAB_SAMPLE_STATUSES.includes(next as (typeof LAB_SAMPLE_STATUSES)[number])) {
      throw new BadRequestException(
        `status must be one of ${LAB_SAMPLE_STATUSES.join(', ')}`,
      );
    }

    const sample = await this.prisma.samples.findFirst({
      where: { id: input.sampleId },
      include: { request: true },
    });
    if (!sample) throw new NotFoundException('Sample not found');
    if (sample.patient_id !== sample.request.patient_id) {
      throw new BadRequestException(
        'Sample patient does not match request patient',
      );
    }
    if (['CANCELLED', 'COMPLETED'].includes(sample.request.status)) {
      throw new BadRequestException(
        `Cannot update sample for request status ${sample.request.status}`,
      );
    }

    const allowed = SAMPLE_TRANSITIONS[sample.status] ?? [];
    // Idempotent: already at the requested status (double-click / stale UI)
    if (sample.status === next) {
      return this.ops.getSample(sample.id);
    }
    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Cannot transition sample from ${sample.status} to ${next}`,
      );
    }

    await this.prisma.samples.update({
      where: { id: sample.id },
      data: {
        status: next,
        ...(input.notes !== undefined
          ? { notes: input.notes?.trim() || null }
          : {}),
      },
    });

    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'UPDATE',
      entityType: 'laboratory.samples',
      entityId: sample.id,
      newValues: { from: sample.status, to: next },
    });
    this.events.emit(LAB_EVENTS.SAMPLE_STATUS, {
      sampleId: sample.id,
      status: next,
    });
    return this.ops.getSample(sample.id);
  }

  public async enterResult(input: {
    requestId: string;
    parameterId: string;
    resultValue: string;
    interpretation?: string;
    notes?: string;
    performedBy: string;
  }) {
    const request = await this.prisma.laboratoryRequests.findFirst({
      where: { id: input.requestId },
    });
    if (!request) throw new NotFoundException('Lab request not found');
    if (request.status === 'CANCELLED') {
      throw new BadRequestException('Request is cancelled');
    }
    if (request.status === 'COMPLETED') {
      throw new BadRequestException('Request is already completed');
    }
    if (!input.parameterId) {
      throw new BadRequestException('parameterId is required');
    }
    if (!input.resultValue?.trim()) {
      throw new BadRequestException('resultValue is required');
    }

    const interpretation = (
      input.interpretation || 'NORMAL'
    ).toUpperCase();
    if (
      !LAB_INTERPRETATIONS.includes(
        interpretation as (typeof LAB_INTERPRETATIONS)[number],
      )
    ) {
      throw new BadRequestException(
        `interpretation must be one of ${LAB_INTERPRETATIONS.join(', ')}`,
      );
    }

    const parameter = await this.prisma.testParameters.findFirst({
      where: { id: input.parameterId, is_active: true },
      include: { test_type: true },
    });
    if (!parameter) throw new NotFoundException('Parameter not found');

    const ordered = this.ops.parseNotes(request.notes).orderedTestTypeIds;
    if (
      ordered.length &&
      !ordered.includes(parameter.test_type_id)
    ) {
      throw new BadRequestException(
        'Parameter does not belong to an ordered test type for this request',
      );
    }

    const existing = await this.prisma.results.findFirst({
      where: {
        request_id: input.requestId,
        parameter_id: input.parameterId,
      },
      orderBy: { created_at: 'desc' },
    });
    if (existing?.verified_at) {
      throw new ForbiddenException(
        'Verified results cannot be overwritten — use correction',
      );
    }

    const now = new Date();
    let resultId: string;
    if (existing) {
      await this.prisma.results.update({
        where: { id: existing.id },
        data: {
          result_value: input.resultValue.trim(),
          interpretation,
          notes: input.notes?.trim() || null,
          performed_by: input.performedBy,
          performed_at: now,
        },
      });
      resultId = existing.id;
    } else {
      const created = await this.prisma.results.create({
        data: {
          request_id: input.requestId,
          parameter_id: input.parameterId,
          result_value: input.resultValue.trim(),
          interpretation,
          notes: input.notes?.trim() || null,
          performed_by: input.performedBy,
          performed_at: now,
        },
      });
      resultId = created.id;
    }

    if (request.status === 'PENDING') {
      await this.prisma.laboratoryRequests.update({
        where: { id: request.id },
        data: { status: 'IN_PROGRESS' },
      });
    }

    await this.prisma.samples.updateMany({
      where: {
        request_id: input.requestId,
        status: { in: ['REGISTERED', 'IN_PROGRESS'] },
      },
      data: { status: 'PENDING_RESULTS' },
    });

    await this.audit.recordMutation({
      userId: input.performedBy,
      action: existing ? 'UPDATE' : 'CREATE',
      entityType: 'laboratory.results',
      entityId: resultId,
      newValues: { interpretation },
    });

    this.events.emit(LAB_EVENTS.RESULT_ENTERED, {
      requestId: input.requestId,
      resultId,
    });
    if (interpretation === 'CRITICAL') {
      this.events.emit(LAB_EVENTS.RESULT_CRITICAL, {
        requestId: input.requestId,
        resultId,
        parameterId: input.parameterId,
      });
    }

    const results = await this.ops.listResults({
      requestId: input.requestId,
      take: 100,
    });
    return results.items.find((r) => r.id === resultId)!;
  }

  public async enterResultsBatch(input: {
    requestId: string;
    performedBy: string;
    lines: Array<{
      parameterId: string;
      resultValue: string;
      interpretation?: string;
      notes?: string;
    }>;
  }) {
    if (!input.lines?.length) {
      throw new BadRequestException('At least one result line is required');
    }
    const out = [];
    for (const line of input.lines) {
      out.push(
        await this.enterResult({
          requestId: input.requestId,
          parameterId: line.parameterId,
          resultValue: line.resultValue,
          interpretation: line.interpretation,
          notes: line.notes,
          performedBy: input.performedBy,
        }),
      );
    }
    return out;
  }

  public async correctResult(input: {
    requestId: string;
    resultId: string;
    resultValue: string;
    interpretation?: string;
    notes?: string;
    actorUserId: string;
  }) {
    if (!input.resultValue?.trim()) {
      throw new BadRequestException('resultValue is required');
    }
    const interpretation = (
      input.interpretation || 'NORMAL'
    ).toUpperCase();
    if (
      !LAB_INTERPRETATIONS.includes(
        interpretation as (typeof LAB_INTERPRETATIONS)[number],
      )
    ) {
      throw new BadRequestException(
        `interpretation must be one of ${LAB_INTERPRETATIONS.join(', ')}`,
      );
    }

    const result = await this.prisma.results.findFirst({
      where: { id: input.resultId, request_id: input.requestId },
    });
    if (!result) throw new NotFoundException('Result not found');

    const request = await this.prisma.laboratoryRequests.findFirst({
      where: { id: input.requestId },
    });
    if (!request) throw new NotFoundException('Lab request not found');
    if (request.status === 'CANCELLED') {
      throw new BadRequestException('Request is cancelled');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.results.update({
        where: { id: result.id },
        data: {
          result_value: input.resultValue.trim(),
          interpretation,
          notes: input.notes?.trim() || null,
          performed_by: input.actorUserId,
          performed_at: new Date(),
          verified_by: null,
          verified_at: null,
        },
      });
      if (request.status === 'COMPLETED') {
        await tx.laboratoryRequests.update({
          where: { id: request.id },
          data: { status: 'IN_PROGRESS' },
        });
      }
    });

    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'UPDATE',
      entityType: 'laboratory.results',
      entityId: result.id,
      newValues: { correction: true, interpretation },
    });
    this.events.emit(LAB_EVENTS.RESULT_CORRECTED, {
      requestId: input.requestId,
      resultId: result.id,
    });
    if (interpretation === 'CRITICAL') {
      this.events.emit(LAB_EVENTS.RESULT_CRITICAL, {
        requestId: input.requestId,
        resultId: result.id,
      });
    }

    const listed = await this.ops.listResults({
      requestId: input.requestId,
      take: 100,
    });
    return listed.items.find((r) => r.id === result.id)!;
  }

  public async verifyResult(input: {
    requestId: string;
    resultId: string;
    verifiedBy: string;
  }) {
    const { completed, critical } = await this.prisma.$transaction(
      async (tx) => {
        const result = await tx.results.findFirst({
          where: { id: input.resultId, request_id: input.requestId },
        });
        if (!result) throw new NotFoundException('Result not found');
        if (!result.performed_at) {
          throw new BadRequestException('Result has not been performed yet');
        }
        if (result.verified_at) {
          throw new BadRequestException('Result is already verified');
        }

        const request = await tx.laboratoryRequests.findFirst({
          where: { id: input.requestId },
        });
        if (!request) throw new NotFoundException('Lab request not found');
        if (request.status === 'CANCELLED') {
          throw new BadRequestException('Request is cancelled');
        }

        await tx.results.update({
          where: { id: result.id },
          data: {
            verified_by: input.verifiedBy,
            verified_at: new Date(),
          },
        });

        const done = await this.maybeCompleteRequest(tx, request.id);
        return {
          completed: done,
          critical: result.interpretation === 'CRITICAL',
        };
      },
    );

    await this.audit.recordMutation({
      userId: input.verifiedBy,
      action: 'UPDATE',
      entityType: 'laboratory.results',
      entityId: input.resultId,
      newValues: { verified: true },
    });
    this.events.emit(LAB_EVENTS.RESULT_VERIFIED, {
      requestId: input.requestId,
      resultId: input.resultId,
      critical,
    });
    if (completed) {
      this.events.emit(LAB_EVENTS.REQUEST_COMPLETED, {
        requestId: input.requestId,
      });
      // Visit stage stays LAB_PENDING until explicit releaseToDoctor.
    }
    return this.ops.getRequest(input.requestId);
  }

  /**
   * Release verified / completed lab results to the ordering doctor.
   * Persists release metadata on the request notes and advances the visit
   * to RESULTS_READY. Doctor Lab Report queries LIS via visitId — it does
   * not rely on visit.payload.labOrder result values.
   */
  public async releaseToDoctor(input: {
    requestId: string;
    actorUserId: string;
  }) {
    const request = await this.prisma.laboratoryRequests.findFirst({
      where: { id: input.requestId },
    });
    if (!request) throw new NotFoundException('Lab request not found');
    if (request.status === 'CANCELLED') {
      throw new BadRequestException('Cannot release a cancelled request');
    }
    if (request.status !== 'COMPLETED') {
      throw new BadRequestException(
        'Request must be COMPLETED (all results verified) before releasing to doctor',
      );
    }

    const parsed = this.ops.parseNotes(request.notes);
    const visitId = await this.resolveVisitIdForRequest(request);
    const releasedAt = parsed.releasedToDoctorAt || new Date().toISOString();

    // Always persist visitId + release metadata (repairs stripped notes)
    const notes = this.ops.encodeNotesPayload({
      ...parsed,
      ...(visitId ? { visitId } : {}),
      releasedToDoctorAt: releasedAt,
      releasedToDoctorBy: parsed.releasedToDoctorBy || input.actorUserId,
    });
    await this.prisma.laboratoryRequests.update({
      where: { id: input.requestId },
      data: { notes },
    });

    await this.syncVisitResultsReady(visitId);

    if (!parsed.releasedToDoctorAt) {
      await this.audit.recordMutation({
        userId: input.actorUserId,
        action: 'UPDATE',
        entityType: 'laboratory.requests',
        entityId: input.requestId,
        newValues: {
          releasedToDoctorAt: releasedAt,
          releasedToDoctorBy: input.actorUserId,
          visitId: visitId ?? null,
        },
      });
      this.events.emit(LAB_EVENTS.RESULT_RELEASED, {
        requestId: input.requestId,
        visitId: visitId ?? null,
        releasedAt,
      });
    }

    return this.ops.getRequest(input.requestId);
  }

  /**
   * One-shot / admin repair: advance visits stuck in LAB_PENDING when the
   * linked lab request was already released to the doctor.
   */
  public async repairReleasedVisitStages(actorUserId?: string) {
    const candidates = await this.prisma.laboratoryRequests.findMany({
      where: {
        status: 'COMPLETED',
        notes: { contains: 'releasedToDoctorAt' },
      },
      select: {
        id: true,
        request_number: true,
        notes: true,
      },
      take: 500,
    });

    let repaired = 0;
    const items: Array<{
      requestId: string;
      visitId: string | null;
      stageUpdated: boolean;
      visitIdRestored: boolean;
    }> = [];

    for (const request of candidates) {
      const parsed = this.ops.parseNotes(request.notes);
      if (!parsed.releasedToDoctorAt) continue;

      const visitId = await this.resolveVisitIdForRequest(request);
      const visitIdRestored = Boolean(visitId && visitId !== parsed.visitId);
      if (visitIdRestored || !parsed.visitId) {
        const notes = this.ops.encodeNotesPayload({
          ...parsed,
          ...(visitId ? { visitId } : {}),
        });
        await this.prisma.laboratoryRequests.update({
          where: { id: request.id },
          data: { notes },
        });
      }

      let stageUpdated = false;
      if (visitId) {
        const result = await this.prisma.outpatientVisits.updateMany({
          where: { id: visitId, stage: 'LAB_PENDING' },
          data: { stage: 'RESULTS_READY' },
        });
        stageUpdated = result.count > 0;
      }

      if (stageUpdated || visitIdRestored) {
        repaired += 1;
        if (actorUserId) {
          await this.audit.recordMutation({
            userId: actorUserId,
            action: 'UPDATE',
            entityType: 'laboratory.requests',
            entityId: request.id,
            newValues: {
              repair: 'released_visit_sync',
              visitId,
              stageUpdated,
            },
          });
        }
      }

      items.push({
        requestId: request.id,
        visitId,
        stageUpdated,
        visitIdRestored,
      });
    }

    return { scanned: candidates.length, repaired, items };
  }

  /**
   * Resolve outpatient visit id from notes.visitId or LAB-{uuidPrefix} request number.
   */
  private async resolveVisitIdForRequest(request: {
    request_number: string | null;
    notes: string | null;
  }): Promise<string | null> {
    const parsed = this.ops.parseNotes(request.notes);
    if (parsed.visitId?.trim()) {
      const byId = await this.prisma.outpatientVisits.findFirst({
        where: { id: parsed.visitId.trim() },
        select: { id: true },
      });
      if (byId) return byId.id;
    }

    const num = (request.request_number || '').trim().toUpperCase();
    const match = /^LAB-([0-9A-F]{8})$/.exec(num);
    if (!match) return null;
    const prefix = match[1].toLowerCase();

    // UuidFilter has no startsWith — match via SQL on clinical.outpatient_visits
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM clinical.outpatient_visits
      WHERE id::text LIKE ${prefix + '%'}
      ORDER BY updated_at DESC
      LIMIT 1
    `;
    return rows[0]?.id ?? null;
  }

  private async syncVisitResultsReady(visitId?: string | null) {
    if (!visitId?.trim()) return;
    try {
      await this.prisma.outpatientVisits.updateMany({
        where: { id: visitId, stage: 'LAB_PENDING' },
        data: { stage: 'RESULTS_READY' },
      });
    } catch {
      /* visit sync is best-effort */
    }
  }

  /** @deprecated Prefer verifyResult — kept for existing callers/tests */
  public async verifyAndComplete(input: {
    requestId: string;
    resultId: string;
    verifiedBy: string;
  }) {
    return this.verifyResult(input);
  }

  private async maybeCompleteRequest(tx: any, requestId: string) {
    const request = await tx.laboratoryRequests.findFirst({
      where: { id: requestId },
    });
    if (!request || request.status === 'COMPLETED') return false;

    const ordered = this.ops.parseNotes(request.notes).orderedTestTypeIds;
    const results: Array<{
      parameter_id: string;
      verified_at: Date | null;
    }> = await tx.results.findMany({
      where: { request_id: requestId },
      include: { parameter: true },
    });

    if (!results.length) return false;
    if (results.some((r) => !r.verified_at)) return false;

    if (ordered.length) {
      const params: Array<{ id: string }> = await tx.testParameters.findMany({
        where: { test_type_id: { in: ordered }, is_active: true },
        select: { id: true },
      });
      const verifiedIds = new Set(
        results.filter((r) => r.verified_at).map((r) => r.parameter_id),
      );
      const allCovered = params.every((p) => verifiedIds.has(p.id));
      if (!allCovered) return false;
    }

    await tx.laboratoryRequests.update({
      where: { id: requestId },
      data: { status: 'COMPLETED' },
    });
    await tx.samples.updateMany({
      where: {
        request_id: requestId,
        status: { notIn: ['CANCELLED'] },
      },
      data: { status: 'COMPLETED' },
    });
    return true;
  }

  private async resolveStaff(staffOrUserId: string) {
    let staff = await this.prisma.staffProfiles.findFirst({
      where: { id: staffOrUserId, deleted_at: null },
    });
    if (!staff) {
      staff = await this.prisma.staffProfiles.findFirst({
        where: { user_id: staffOrUserId, deleted_at: null },
      });
    }
    if (staff) return staff;

    const user = await this.prisma.user.findFirst({
      where: { id: staffOrUserId, deleted_at: null },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException(
        'Collecting staff not found. Pass collectedBy as a staff profile id, or ensure the signed-in user has a StaffProfiles row.',
      );
    }

    // Auto-provision a minimal staff profile so lab techs can register samples
    // without a separate HR setup step blocking the LIS workflow.
    const suffix = `${user.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
    try {
      staff = await this.prisma.staffProfiles.create({
        data: {
          user_id: user.id,
          employee_id: `LAB-${suffix}`,
          position: 'Laboratory',
          join_date: new Date(),
          is_active: true,
        },
      });
    } catch {
      staff = await this.prisma.staffProfiles.findFirst({
        where: { user_id: user.id, deleted_at: null },
      });
    }
    if (!staff) {
      throw new BadRequestException(
        'Could not resolve or create a staff profile for the collecting user. Ask an admin to link StaffProfiles.user_id to this account.',
      );
    }
    return staff;
  }
}

export {
  LAB_PRIORITIES,
  LAB_SAMPLE_STATUSES,
  LAB_INTERPRETATIONS,
};
