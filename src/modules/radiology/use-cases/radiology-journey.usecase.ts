/**
 * Radiology journey — request lifecycle, findings, and reports.
 * Mirrors laboratory/use-cases/lab-journey.usecase.ts. Enforces the real
 * state machine (the old RadiologyClinicalUseCase let any status be PATCHed
 * directly) and audits every mutation (previously none were audited).
 */

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createDomainEventId } from '../../../core/domain';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { HmsAuditWriter } from '../../audit/hms-audit.writer';
import { IMAGING_PRIORITIES, RadiologyOperationsUseCase } from './radiology-operations.usecase';

export const IMAGING_EVENTS = {
  REQUESTED: 'radiology.request_created',
  REQUEST_CANCELLED: 'radiology.request_cancelled',
  REQUEST_NO_SHOW: 'radiology.request_no_show',
  SCHEDULED: 'radiology.request_scheduled',
  CHECKED_IN: 'radiology.request_checked_in',
  STARTED: 'radiology.exam_started',
  COMPLETED: 'radiology.exam_completed',
  FINDINGS_ENTERED: 'radiology.findings_entered',
  REPORT_ENTERED: 'radiology.report_entered',
  REPORT_READY: 'radiology.report_ready',
  REPORT_AMENDED: 'radiology.report_amended',
} as const;

const TERMINAL_STATUSES = ['CANCELLED', 'NO_SHOW', 'FINALIZED'];

@Injectable()
export class RadiologyJourneyUseCase {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly audit: HmsAuditWriter,
    private readonly ops: RadiologyOperationsUseCase,
  ) {}

  public async createRequest(input: {
    patientId: string;
    scanTypeId: string;
    requestingDoctorId?: string;
    consultationId?: string;
    clinicalIndication?: string;
    priority?: string;
    requestedBy: string;
  }) {
    const patient = await this.prisma.patients.findFirst({
      where: { id: input.patientId, deleted_at: null },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    const scanType = await this.prisma.scanTypes.findFirst({
      where: { id: input.scanTypeId, is_active: true },
    });
    if (!scanType) throw new BadRequestException('Scan type not found or inactive');

    const priority = (input.priority || 'ROUTINE').toUpperCase();
    if (!IMAGING_PRIORITIES.includes(priority as (typeof IMAGING_PRIORITIES)[number])) {
      throw new BadRequestException(`priority must be one of ${IMAGING_PRIORITIES.join(', ')}`);
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

    const requestNumber = `RAD-${Date.now().toString(36).toUpperCase()}`;
    const request = await this.prisma.radiologyRequests.create({
      data: {
        request_number: requestNumber,
        patient_id: input.patientId,
        scan_type_id: input.scanTypeId,
        requesting_doctor_id: input.requestingDoctorId || null,
        consultation_id: input.consultationId || null,
        clinical_indication: input.clinicalIndication?.trim() || null,
        priority,
        status: 'PENDING',
        requested_by: input.requestedBy,
      },
    });

    await this.audit.recordMutation({
      userId: input.requestedBy,
      action: 'CREATE',
      entityType: 'radiology.requests',
      entityId: request.id,
      newValues: { requestNumber, patientId: input.patientId, scanTypeId: input.scanTypeId },
    });

    const radiologists = await this.prisma.staffProfiles.findMany({
      where: {
        deleted_at: null,
        is_active: true,
        user: { core_user_roles_user_id: { some: { role: { name: 'RADIOLOGIST' } } } },
      },
      select: { user_id: true },
    });
    this.emit(IMAGING_EVENTS.REQUESTED, {
      requestId: request.id,
      radiologistUserIds: radiologists.map((r) => r.user_id),
    });

    return this.ops.getRequest(request.id);
  }

  public async scheduleRequest(
    id: string,
    input: { scheduledAt: string; actorUserId: string },
  ) {
    const request = await this.assertStatus(id, ['PENDING', 'SCHEDULED']);
    const scheduledAt = new Date(input.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('scheduledAt is invalid');
    }
    await this.prisma.radiologyRequests.update({
      where: { id },
      data: { status: 'SCHEDULED', scheduled_at: scheduledAt },
    });
    await this.recordTransition(id, request.status, 'SCHEDULED', input.actorUserId);
    this.emit(IMAGING_EVENTS.SCHEDULED, { requestId: id });
    return this.ops.getRequest(id);
  }

  public async checkIn(id: string, actorUserId: string) {
    const request = await this.assertStatus(id, ['PENDING', 'SCHEDULED']);
    await this.prisma.radiologyRequests.update({
      where: { id },
      data: { status: 'CHECKED_IN', checked_in_at: new Date() },
    });
    await this.recordTransition(id, request.status, 'CHECKED_IN', actorUserId);
    this.emit(IMAGING_EVENTS.CHECKED_IN, { requestId: id });
    return this.ops.getRequest(id);
  }

  public async startExam(id: string, actorUserId: string) {
    const request = await this.assertStatus(id, ['PENDING', 'SCHEDULED', 'CHECKED_IN']);
    await this.prisma.radiologyRequests.update({
      where: { id },
      data: { status: 'IN_PROGRESS', started_at: new Date() },
    });
    await this.recordTransition(id, request.status, 'IN_PROGRESS', actorUserId);
    this.emit(IMAGING_EVENTS.STARTED, { requestId: id });
    return this.ops.getRequest(id);
  }

  public async completeExam(id: string, actorUserId: string) {
    const request = await this.assertStatus(id, ['IN_PROGRESS']);
    await this.prisma.radiologyRequests.update({
      where: { id },
      data: { status: 'COMPLETED', completed_at: new Date() },
    });
    await this.recordTransition(id, request.status, 'COMPLETED', actorUserId);
    this.emit(IMAGING_EVENTS.COMPLETED, { requestId: id });
    return this.ops.getRequest(id);
  }

  public async cancelRequest(id: string, input: { reason?: string; actorUserId: string }) {
    const request = await this.prisma.radiologyRequests.findFirst({ where: { id } });
    if (!request) throw new NotFoundException('Radiology request not found');
    if (TERMINAL_STATUSES.includes(request.status) || request.status === 'CANCELLED') {
      throw new BadRequestException(`Cannot cancel a request with status ${request.status}`);
    }
    await this.prisma.radiologyRequests.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelled_at: new Date(),
        cancellation_reason: input.reason?.trim() || null,
      },
    });
    await this.recordTransition(id, request.status, 'CANCELLED', input.actorUserId, {
      reason: input.reason,
    });
    this.emit(IMAGING_EVENTS.REQUEST_CANCELLED, { requestId: id });
    return this.ops.getRequest(id);
  }

  public async markNoShow(id: string, actorUserId: string) {
    const request = await this.assertStatus(id, ['PENDING', 'SCHEDULED']);
    await this.prisma.radiologyRequests.update({
      where: { id },
      data: { status: 'NO_SHOW', cancelled_at: new Date() },
    });
    await this.recordTransition(id, request.status, 'NO_SHOW', actorUserId);
    this.emit(IMAGING_EVENTS.REQUEST_NO_SHOW, { requestId: id });
    return this.ops.getRequest(id);
  }

  // ── Findings ───────────────────────────────────────────────

  public async enterFindings(
    id: string,
    input: { radiologistId: string; findingsText?: string; status?: string; actorUserId: string },
  ) {
    const request = await this.assertStatus(id, ['COMPLETED', 'REPORT_PENDING']);
    const status = (input.status || 'DRAFT').toUpperCase();
    if (!['DRAFT', 'FINALIZED'].includes(status)) {
      throw new BadRequestException('findings status must be DRAFT or FINALIZED');
    }

    const row = await this.prisma.findings.create({
      data: {
        request_id: id,
        radiologist_id: input.radiologistId,
        findings_text: input.findingsText?.trim() || null,
        status,
      },
    });

    if (request.status === 'COMPLETED') {
      await this.prisma.radiologyRequests.update({
        where: { id },
        data: { status: 'REPORT_PENDING' },
      });
      await this.recordTransition(id, 'COMPLETED', 'REPORT_PENDING', input.actorUserId);
    }

    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'CREATE',
      entityType: 'radiology.findings',
      entityId: row.id,
      newValues: { requestId: id, status },
    });
    this.emit(IMAGING_EVENTS.FINDINGS_ENTERED, { requestId: id, findingsId: row.id });
    return row;
  }

  // ── Reports ────────────────────────────────────────────────

  public async enterReport(
    id: string,
    input: {
      radiologistId: string;
      findingsId?: string;
      templateId?: string;
      sectionsData?: Record<string, unknown>;
      finalImpression?: string;
      conclusion?: string;
      recommendations?: string;
      finalize?: boolean;
      signature?: string;
      actorUserId: string;
    },
  ) {
    const request = await this.assertStatus(id, ['REPORT_PENDING']);

    let findingsId = input.findingsId;
    if (!findingsId) {
      const latestFindings = await this.prisma.findings.findFirst({
        where: { request_id: id },
        orderBy: { created_at: 'desc' },
      });
      findingsId = latestFindings?.id;
      if (!findingsId) {
        const created = await this.prisma.findings.create({
          data: { request_id: id, radiologist_id: input.radiologistId, status: 'DRAFT' },
        });
        findingsId = created.id;
      }
    }

    if (input.templateId) {
      const template = await this.prisma.reportTemplates.findFirst({
        where: { id: input.templateId, is_active: true },
      });
      if (!template) throw new BadRequestException('Report template not found or inactive');
    }

    const finalize = Boolean(input.finalize);
    const now = new Date();
    const row = await this.prisma.reports.create({
      data: {
        request_id: id,
        findings_id: findingsId,
        template_id: input.templateId || null,
        sections_data: (input.sectionsData ?? undefined) as never,
        final_impression: input.finalImpression?.trim() || null,
        conclusion: input.conclusion?.trim() || null,
        recommendations: input.recommendations?.trim() || null,
        radiologist_signature: input.signature?.trim() || null,
        signed_at: input.signature ? now : null,
        version: 1,
        status: finalize ? 'FINAL' : 'DRAFT',
        finalized_by: finalize ? input.actorUserId : null,
        finalized_at: finalize ? now : null,
      },
    });

    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'CREATE',
      entityType: 'radiology.reports',
      entityId: row.id,
      newValues: { requestId: id, status: row.status },
    });
    this.emit(IMAGING_EVENTS.REPORT_ENTERED, { requestId: id, reportId: row.id, finalize });

    if (finalize) {
      await this.prisma.radiologyRequests.update({
        where: { id },
        data: { status: 'REPORTED', reported_at: now },
      });
      await this.recordTransition(id, request.status, 'REPORTED', input.actorUserId);
    }
    return row;
  }

  /** Release the (already-finalized-report) request to the referring doctor. */
  public async finalizeRequest(id: string, actorUserId: string) {
    const request = await this.assertStatus(id, ['REPORTED']);
    await this.prisma.radiologyRequests.update({
      where: { id },
      data: { status: 'FINALIZED', finalized_at: new Date() },
    });
    await this.recordTransition(id, request.status, 'FINALIZED', actorUserId);

    const full = await this.prisma.radiologyRequests.findFirst({
      where: { id },
      select: { requesting_doctor: { select: { user_id: true } } },
    });
    this.emit(IMAGING_EVENTS.REPORT_READY, {
      requestId: id,
      doctorUserId: full?.requesting_doctor?.user_id ?? undefined,
    });
    return this.ops.getRequest(id);
  }

  /** Amend a finalized report — never overwrite it in place. */
  public async amendReport(
    id: string,
    input: {
      reportId: string;
      radiologistId: string;
      findingsId?: string;
      templateId?: string;
      sectionsData?: Record<string, unknown>;
      finalImpression?: string;
      conclusion?: string;
      recommendations?: string;
      reason: string;
      actorUserId: string;
    },
  ) {
    await this.assertStatus(id, ['FINALIZED']);
    if (!input.reason?.trim()) {
      throw new BadRequestException('An amendment reason is required');
    }
    const original = await this.prisma.reports.findFirst({
      where: { id: input.reportId, request_id: id },
    });
    if (!original) throw new NotFoundException('Original report not found');
    if (original.status !== 'FINAL' && original.status !== 'AMENDED') {
      throw new BadRequestException('Only a finalized report can be amended');
    }

    const now = new Date();
    const row = await this.prisma.reports.create({
      data: {
        request_id: id,
        findings_id: input.findingsId || original.findings_id,
        template_id: input.templateId ?? original.template_id,
        sections_data: (input.sectionsData ?? original.sections_data ?? undefined) as never,
        final_impression: input.finalImpression?.trim() ?? original.final_impression,
        conclusion: input.conclusion?.trim() ?? original.conclusion,
        recommendations: input.recommendations?.trim() ?? original.recommendations,
        version: original.version + 1,
        status: 'AMENDED',
        amends_report_id: original.id,
        amendment_reason: input.reason.trim(),
        finalized_by: input.actorUserId,
        finalized_at: now,
      },
    });

    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'CREATE',
      entityType: 'radiology.reports',
      entityId: row.id,
      oldValues: { amendsReportId: original.id },
      newValues: { requestId: id, status: 'AMENDED', reason: input.reason },
    });
    this.emit(IMAGING_EVENTS.REPORT_AMENDED, {
      requestId: id,
      reportId: row.id,
      amendsReportId: original.id,
    });
    return row;
  }

  // ── Helpers ────────────────────────────────────────────────

  private async assertStatus(id: string, allowed: string[]) {
    const request = await this.prisma.radiologyRequests.findFirst({ where: { id } });
    if (!request) throw new NotFoundException('Radiology request not found');
    if (!allowed.includes(request.status)) {
      throw new BadRequestException(
        `Cannot perform this action while status is ${request.status} (expected one of ${allowed.join(', ')})`,
      );
    }
    return request;
  }

  private async recordTransition(
    requestId: string,
    from: string,
    to: string,
    userId: string,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.recordMutation({
      userId,
      action: 'UPDATE',
      entityType: 'radiology.requests',
      entityId: requestId,
      oldValues: { status: from },
      newValues: { status: to, ...extra },
    });
  }

  private emit(type: string, payload: Record<string, unknown>): void {
    this.events.emit(type, {
      id: createDomainEventId(),
      type,
      occurredAt: new Date().toISOString(),
      payload,
    });
  }
}
