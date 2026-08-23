/**
 * FollowUpsService — CRUD, doctor scope, ensure/backfill behaviors.
 */

import {
  ConflictException,
  ForbiddenException,
  NotFoundException as HttpNotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { Result } from '../../../core/contracts';
import {
  BaseApplicationException,
  NotFoundException,
} from '../../../core/exceptions';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { FOLLOW_UPS_REPOSITORY } from '../constants/follow-ups.constants';
import { FollowUp } from '../domain/follow-up.entity';
import { FollowUpStatus } from '../enums/follow-up-status.enum';
import { FollowUpsService } from '../follow-ups.service';
import { CreateFollowUpUseCase } from '../use-cases/create-follow-up.usecase';
import { FindAllFollowUpsUseCase } from '../use-cases/find-all-follow-ups.usecase';
import { FindFollowUpByIdUseCase } from '../use-cases/find-follow-up-by-id.usecase';
import { SoftDeleteFollowUpUseCase } from '../use-cases/soft-delete-follow-up.usecase';
import { UpdateFollowUpUseCase } from '../use-cases/update-follow-up.usecase';

class DomainValidationError extends BaseApplicationException {
  constructor(message: string) {
    super({ message, code: 'VALIDATION' });
  }
}

const PAT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONS = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const USER = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const STAFF = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

function makeEntity(overrides: Partial<Parameters<typeof FollowUp.create>[0]> = {}) {
  return FollowUp.create({
    patientId: PAT,
    consultationId: CONS,
    followUpDate: '2026-08-20',
    reason: 'ANC review',
    createdBy: USER,
    ...overrides,
  });
}

describe('FollowUpsService', () => {
  let service: FollowUpsService;
  let createUseCase: { execute: jest.Mock };
  let findByIdUseCase: { execute: jest.Mock };
  let findAllUseCase: { execute: jest.Mock };
  let updateUseCase: { execute: jest.Mock };
  let softDeleteUseCase: { execute: jest.Mock };
  let events: { emit: jest.Mock };
  let prisma: any;
  let repository: any;

  beforeEach(async () => {
    createUseCase = { execute: jest.fn() };
    findByIdUseCase = { execute: jest.fn() };
    findAllUseCase = { execute: jest.fn() };
    updateUseCase = { execute: jest.fn() };
    softDeleteUseCase = { execute: jest.fn() };
    events = { emit: jest.fn() };
    prisma = {
      staffProfiles: { findFirst: jest.fn() },
      patients: { findFirst: jest.fn() },
      consultations: { findFirst: jest.fn() },
      $queryRaw: jest.fn(),
    };
    repository = {
      getSummary: jest.fn().mockResolvedValue({
        scheduledThisMonth: 1,
        completedThisMonth: 0,
        dueWithin7Days: 1,
        overdue: 0,
      }),
      findByConsultationAndDate: jest.fn(),
      findLatestConsultationId: jest.fn(),
      findByIdScoped: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FollowUpsService,
        { provide: CreateFollowUpUseCase, useValue: createUseCase },
        { provide: FindFollowUpByIdUseCase, useValue: findByIdUseCase },
        { provide: FindAllFollowUpsUseCase, useValue: findAllUseCase },
        { provide: UpdateFollowUpUseCase, useValue: updateUseCase },
        { provide: SoftDeleteFollowUpUseCase, useValue: softDeleteUseCase },
        { provide: EventEmitter2, useValue: events },
        { provide: PrismaService, useValue: prisma },
        { provide: FOLLOW_UPS_REPOSITORY, useValue: repository },
      ],
    }).compile();

    service = module.get(FollowUpsService);
  });

  it('create emits event and maps response', async () => {
    const entity = makeEntity();
    createUseCase.execute.mockResolvedValue(Result.success(entity));
    const res = await service.create({
      patientId: PAT,
      consultationId: CONS,
      followUpDate: '2026-08-20',
      reason: 'ANC review',
      createdBy: USER,
    } as any);
    expect(res.id).toBe(entity.getId());
    expect(events.emit).toHaveBeenCalled();
  });

  it('findById / findAll / summary resolve doctor scope', async () => {
    const entity = makeEntity();
    findByIdUseCase.execute.mockResolvedValue(Result.success(entity));
    findAllUseCase.execute.mockResolvedValue(
      Result.success({ items: [entity], total: 1 }),
    );
    prisma.staffProfiles.findFirst.mockResolvedValue({ id: STAFF });

    const doctor = { id: USER, role: 'DOCTOR' } as any;
    const one = await service.findById(entity.getId(), doctor);
    expect(one.id).toBe(entity.getId());
    expect(findByIdUseCase.execute).toHaveBeenCalledWith(entity.getId(), {
      doctorStaffId: STAFF,
    });

    const page = await service.findAll({ page: 1, limit: 10 }, doctor);
    expect(page.total).toBe(1);
    expect(page.items).toHaveLength(1);

    const summary = await service.summary(doctor);
    expect(summary.scheduledThisMonth).toBe(1);
    expect(repository.getSummary).toHaveBeenCalledWith({ doctorStaffId: STAFF });
  });

  it('throws Forbidden when doctor has no staff profile', async () => {
    prisma.staffProfiles.findFirst.mockResolvedValue(null);
    await expect(
      service.summary({ id: USER, role: 'DOCTOR' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('update and softDelete assert access then emit', async () => {
    const entity = makeEntity();
    prisma.staffProfiles.findFirst.mockResolvedValue({ id: STAFF });
    repository.findByIdScoped.mockResolvedValue(entity);
    updateUseCase.execute.mockResolvedValue(Result.success(entity));
    softDeleteUseCase.execute.mockResolvedValue(Result.success(undefined));

    const doctor = { id: USER, role: 'DOCTOR' } as any;
    await service.update(entity.getId(), { status: FollowUpStatus.COMPLETED } as any, doctor);
    await service.softDelete(entity.getId(), doctor);
    expect(events.emit).toHaveBeenCalledTimes(2);

    repository.findByIdScoped.mockResolvedValue(null);
    await expect(
      service.update(entity.getId(), {} as any, doctor),
    ).rejects.toBeInstanceOf(HttpNotFoundException);
  });

  it('update without doctor skips scoped access check', async () => {
    const entity = makeEntity();
    updateUseCase.execute.mockResolvedValue(Result.success(entity));
    await service.update(entity.getId(), {} as any);
    expect(repository.findByIdScoped).not.toHaveBeenCalled();
  });

  it('ensureFromConsultation returns existing or creates new', async () => {
    const existing = makeEntity();
    repository.findByConsultationAndDate.mockResolvedValueOnce(existing);
    const reused = await service.ensureFromConsultation({
      patientId: PAT,
      consultationId: CONS,
      followUpDate: '2026-08-20',
      createdBy: USER,
    });
    expect(reused.id).toBe(existing.getId());
    expect(repository.save).not.toHaveBeenCalled();

    repository.findByConsultationAndDate.mockResolvedValueOnce(null);
    const created = makeEntity({ reason: 'Follow-up from consultation' });
    repository.save.mockResolvedValue(created);
    const fresh = await service.ensureFromConsultation({
      patientId: PAT,
      consultationId: CONS,
      followUpDate: '2026-08-21',
      createdBy: USER,
    });
    expect(fresh.id).toBe(created.getId());
    expect(events.emit).toHaveBeenCalled();
  });

  it('backfillFromVisitPayloads creates and skips edge cases', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'ok',
        patient_id: PAT,
        mrn: 'MRN-1',
        payload: {
          followUpDate: '2026-08-20',
          appointmentId: 'appt-1',
          clinicalRecord: { followUpInstructions: 'Return' },
        },
        reason_for_visit: 'ANC',
      },
      {
        id: 'no-patient',
        patient_id: null,
        mrn: 'UNKNOWN',
        payload: { followUpDate: '2026-08-21' },
        reason_for_visit: null,
      },
      {
        id: 'empty-date',
        patient_id: PAT,
        mrn: 'MRN-1',
        payload: { followUpDate: '' },
        reason_for_visit: null,
      },
      {
        id: 'no-consult',
        patient_id: PAT,
        mrn: 'MRN-1',
        payload: { followUpDate: '2026-08-22' },
        reason_for_visit: 'X',
      },
      {
        id: 'exists',
        patient_id: PAT,
        mrn: 'MRN-1',
        payload: { followUpDate: '2026-08-23' },
        reason_for_visit: 'Y',
      },
      {
        id: 'no-creator',
        patient_id: PAT,
        mrn: 'MRN-1',
        payload: { followUpDate: '2026-08-24' },
        reason_for_visit: 'Z',
      },
      {
        id: 'resolve-mrn',
        patient_id: null,
        mrn: 'MRN-FOUND',
        payload: { followUpDate: '2026-08-25' },
        reason_for_visit: 'Resolved',
      },
    ]);

    prisma.patients.findFirst.mockImplementation(async ({ where }: any) =>
      where.patient_number === 'MRN-FOUND' ? { id: PAT } : null,
    );

    prisma.consultations.findFirst.mockImplementation(async (args: any) => {
      if (args?.where?.appointment_id === 'appt-1') return { id: CONS };
      if (args?.select?.created_by) {
        if (args.where.id === 'cons-no-creator') return { created_by: null };
        return { created_by: USER };
      }
      return null;
    });

    repository.findLatestConsultationId
      .mockResolvedValueOnce(null) // no-consult
      .mockResolvedValueOnce(CONS) // exists
      .mockResolvedValueOnce('cons-no-creator') // no-creator
      .mockResolvedValueOnce(CONS); // resolve-mrn

    // Call order: ok check+ensure, exists check, no-creator check, resolve-mrn check+ensure
    repository.findByConsultationAndDate
      .mockResolvedValueOnce(null) // ok — backfill check
      .mockResolvedValueOnce(null) // ok — ensureFromConsultation
      .mockResolvedValueOnce(makeEntity()) // exists — skip
      .mockResolvedValueOnce(null) // no-creator — proceeds to creator check
      .mockResolvedValueOnce(null) // resolve-mrn — backfill check
      .mockResolvedValueOnce(null); // resolve-mrn — ensureFromConsultation

    repository.save.mockImplementation(async (e: FollowUp) => e);

    const result = await service.backfillFromVisitPayloads();
    expect(result).toEqual({ scanned: 7, created: 2, skipped: 5 });
  });

  it('backfill skips when follow-up already exists for consultation+date', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'dup',
        patient_id: PAT,
        mrn: 'MRN-1',
        payload: { followUpDate: '2026-09-01' },
        reason_for_visit: 'Dup',
      },
    ]);
    repository.findLatestConsultationId.mockResolvedValue(CONS);
    repository.findByConsultationAndDate.mockResolvedValue(makeEntity());

    const result = await service.backfillFromVisitPayloads();
    expect(result).toEqual({ scanned: 1, created: 0, skipped: 1 });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('unwrap maps domain errors to HTTP exceptions', async () => {
    findByIdUseCase.execute.mockResolvedValue(
      Result.failure(new NotFoundException('FollowUp', 'x')),
    );
    await expect(service.findById('x')).rejects.toBeInstanceOf(HttpNotFoundException);

    findByIdUseCase.execute.mockResolvedValue(
      Result.failure(new DomainValidationError('bad')),
    );
    await expect(service.findById('x')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );

    findByIdUseCase.execute.mockResolvedValue(Result.failure('conflict'));
    await expect(service.findById('x')).rejects.toBeInstanceOf(ConflictException);
  });
});
