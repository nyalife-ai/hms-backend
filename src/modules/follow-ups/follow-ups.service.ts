/**
 * File: follow-ups.service.ts
 * Module: follow-ups
 * Purpose: Application service orchestrating use-cases + doctor scope.
 */

import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException as HttpNotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Result } from '../../core/contracts';
import { BaseApplicationException, NotFoundException } from '../../core/exceptions';
import { PrismaService } from '../../database/prisma/prisma.service';
import { PaginationService } from '../../platform/api/pagination/pagination.service';
import type { AuthUserPublic } from '../auth/auth.types';
import type {
  CreateFollowUpDto,
  FollowUpsQueryDto,
  FollowUpsSummaryDto,
  UpdateFollowUpDto,
} from './dto';
import { FollowUp } from './domain/follow-up.entity';
import { FollowUpMapper } from './mappers/follow-up.mapper';
import {
  FOLLOW_UPS_EVENTS,
  FOLLOW_UPS_REPOSITORY,
} from './constants/follow-ups.constants';
import { FollowUpCreatedEvent, FollowUpDeletedEvent, FollowUpUpdatedEvent } from './events';
import { FollowUpStatus } from './enums/follow-up-status.enum';
import type {
  FollowUpListScope,
  IFollowUpRepository,
} from './interfaces/follow-up-repository.interface';
import { CreateFollowUpUseCase } from './use-cases/create-follow-up.usecase';
import { FindFollowUpByIdUseCase } from './use-cases/find-follow-up-by-id.usecase';
import { FindAllFollowUpsUseCase } from './use-cases/find-all-follow-ups.usecase';
import { UpdateFollowUpUseCase } from './use-cases/update-follow-up.usecase';
import { SoftDeleteFollowUpUseCase } from './use-cases/soft-delete-follow-up.usecase';

@Injectable()
export class FollowUpsService {
  private readonly pagination = new PaginationService(20, 500);

  public constructor(
    private readonly createUseCase: CreateFollowUpUseCase,
    private readonly findByIdUseCase: FindFollowUpByIdUseCase,
    private readonly findAllUseCase: FindAllFollowUpsUseCase,
    private readonly updateUseCase: UpdateFollowUpUseCase,
    private readonly softDeleteUseCase: SoftDeleteFollowUpUseCase,
    private readonly events: EventEmitter2,
    private readonly prisma: PrismaService,
    @Inject(FOLLOW_UPS_REPOSITORY)
    private readonly repository: IFollowUpRepository,
  ) {}

  public async create(dto: CreateFollowUpDto) {
    const result = await this.createUseCase.execute(dto);
    const entity = this.unwrap(result);
    this.events.emit(FOLLOW_UPS_EVENTS.CREATED, new FollowUpCreatedEvent(entity.getId()));
    return FollowUpMapper.toResponse(entity);
  }

  public async findById(id: string, user?: AuthUserPublic) {
    const scope = await this.resolveScope(user);
    const result = await this.findByIdUseCase.execute(id, scope);
    return FollowUpMapper.toResponse(this.unwrap(result));
  }

  public async findAll(query: FollowUpsQueryDto, user?: AuthUserPublic) {
    const scope = await this.resolveScope(user);
    const normalized = this.pagination.normalizeOffset({
      page: query.page,
      limit: query.limit,
    });
    const result = await this.findAllUseCase.execute(
      { ...query, ...normalized },
      scope,
    );
    const page = this.unwrap(result);
    return this.pagination.buildResult(FollowUpMapper.toResponseList(page.items), {
      total: page.total,
      page: normalized.page,
      limit: normalized.limit,
    });
  }

  public async summary(user?: AuthUserPublic): Promise<FollowUpsSummaryDto> {
    const scope = await this.resolveScope(user);
    return this.repository.getSummary(scope);
  }

  public async update(id: string, dto: UpdateFollowUpDto, user?: AuthUserPublic) {
    await this.assertCanAccess(id, user);
    const result = await this.updateUseCase.execute(id, dto);
    const entity = this.unwrap(result);
    this.events.emit(FOLLOW_UPS_EVENTS.UPDATED, new FollowUpUpdatedEvent(entity.getId()));
    return FollowUpMapper.toResponse(entity);
  }

  public async softDelete(id: string, user?: AuthUserPublic): Promise<void> {
    await this.assertCanAccess(id, user);
    const result = await this.softDeleteUseCase.execute(id);
    this.unwrap(result);
    this.events.emit(FOLLOW_UPS_EVENTS.DELETED, new FollowUpDeletedEvent(id));
  }

  /**
   * Idempotent create from visit completeConsultation (per consultation + date).
   */
  public async ensureFromConsultation(input: {
    patientId: string;
    consultationId: string;
    followUpDate: string;
    reason?: string;
    notes?: string;
    followUpType?: string;
    createdBy: string;
  }) {
    const existing = await this.repository.findByConsultationAndDate(
      input.consultationId,
      new Date(input.followUpDate),
    );
    if (existing) {
      return FollowUpMapper.toResponse(existing);
    }

    const entity = FollowUp.create({
      patientId: input.patientId,
      consultationId: input.consultationId,
      followUpDate: input.followUpDate,
      reason:
        input.reason?.trim() ||
        input.notes?.trim() ||
        'Follow-up from consultation',
      followUpType: input.followUpType,
      notes: input.notes,
      status: FollowUpStatus.SCHEDULED,
      createdBy: input.createdBy,
    });
    const saved = await this.repository.save(entity);
    this.events.emit(FOLLOW_UPS_EVENTS.CREATED, new FollowUpCreatedEvent(saved.getId()));
    return FollowUpMapper.toResponse(saved);
  }

  /** Backfill clinical.follow_ups from outpatient visit payloads that have followUpDate. */
  public async backfillFromVisitPayloads(): Promise<{
    scanned: number;
    created: number;
    skipped: number;
  }> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        patient_id: string | null;
        mrn: string;
        payload: unknown;
        reason_for_visit: string | null;
      }>
    >`
      SELECT id, patient_id, mrn, payload, reason_for_visit
      FROM clinical.outpatient_visits
      WHERE COALESCE(payload->>'followUpDate', '') <> ''
    `;

    let created = 0;
    let skipped = 0;
    for (const row of rows) {
      const payload = (row.payload ?? {}) as {
        followUpDate?: string;
        appointmentId?: string;
        clinicalRecord?: { followUpInstructions?: string };
      };
      const followUpDate = payload.followUpDate?.slice(0, 10);
      if (!followUpDate) {
        skipped += 1;
        continue;
      }

      let patientId = row.patient_id;
      if (!patientId) {
        const patient = await this.prisma.patients.findFirst({
          where: { patient_number: row.mrn, deleted_at: null },
          select: { id: true },
        });
        patientId = patient?.id ?? null;
      }
      if (!patientId) {
        skipped += 1;
        continue;
      }

      let consultationId: string | null = null;
      if (payload.appointmentId) {
        const byAppt = await this.prisma.consultations.findFirst({
          where: { appointment_id: payload.appointmentId, deleted_at: null },
          select: { id: true },
        });
        consultationId = byAppt?.id ?? null;
      }
      if (!consultationId) {
        consultationId =
          await this.repository.findLatestConsultationId(patientId);
      }
      if (!consultationId) {
        skipped += 1;
        continue;
      }

      const existing = await this.repository.findByConsultationAndDate(
        consultationId,
        new Date(followUpDate),
      );
      if (existing) {
        skipped += 1;
        continue;
      }

      const consult = await this.prisma.consultations.findFirst({
        where: { id: consultationId },
        select: { created_by: true },
      });
      const createdBy = consult?.created_by;
      if (!createdBy) {
        skipped += 1;
        continue;
      }

      await this.ensureFromConsultation({
        patientId,
        consultationId,
        followUpDate,
        reason:
          payload.clinicalRecord?.followUpInstructions?.trim() ||
          row.reason_for_visit?.trim() ||
          'Follow-up from visit',
        createdBy,
      });
      created += 1;
    }

    return { scanned: rows.length, created, skipped };
  }

  private async resolveScope(
    user?: AuthUserPublic,
  ): Promise<FollowUpListScope | undefined> {
    if (!user || user.role !== 'DOCTOR') return undefined;
    const staff = await this.prisma.staffProfiles.findFirst({
      where: { user_id: user.id, deleted_at: null },
      select: { id: true },
    });
    if (!staff) {
      throw new ForbiddenException(
        'Doctor staff profile is required to access follow-ups',
      );
    }
    return { doctorStaffId: staff.id };
  }

  private async assertCanAccess(
    id: string,
    user?: AuthUserPublic,
  ): Promise<void> {
    const scope = await this.resolveScope(user);
    if (!scope?.doctorStaffId) return;
    const row = await this.repository.findByIdScoped(id, scope);
    if (!row) {
      throw new HttpNotFoundException(`FollowUp ${id} not found`);
    }
  }

  private unwrap<T, E>(result: Result<T, E>): T {
    if (result.isSuccess()) return result.getValue();
    const err = result.getError();
    if (err instanceof NotFoundException) {
      throw new HttpNotFoundException(err.message);
    }
    if (err instanceof BaseApplicationException) {
      throw new UnprocessableEntityException(err.message);
    }
    throw new ConflictException(String(err));
  }
}
