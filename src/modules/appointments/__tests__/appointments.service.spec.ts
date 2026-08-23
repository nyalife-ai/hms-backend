/**
 * AppointmentsService — CRUD lifecycle + domain event emission with mocks.
 */

import {
  ConflictException,
  NotFoundException as HttpNotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppointmentsService } from '../appointments.service';
import { CreateAppointmentUseCase } from '../use-cases/create-appointment.usecase';
import { FindAppointmentByIdUseCase } from '../use-cases/find-appointment-by-id.usecase';
import { FindAllAppointmentsUseCase } from '../use-cases/find-all-appointments.usecase';
import { UpdateAppointmentUseCase } from '../use-cases/update-appointment.usecase';
import { SoftDeleteAppointmentUseCase } from '../use-cases/soft-delete-appointment.usecase';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { Result } from '../../../core/contracts';
import {
  NotFoundException,
  ValidationException,
} from '../../../core/exceptions';
import { Appointment } from '../domain/appointment.entity';
import { APPOINTMENT_DOMAIN_EVENTS } from '../events/appointment-domain.events';
import { APPOINTMENTS_EVENTS } from '../constants/appointments.constants';

function makeAppointment(overrides?: Partial<Parameters<typeof Appointment.create>[0]>) {
  return Appointment.create({
    name: 'CONSULTATION',
    patientId: 'pat-1',
    doctorId: 'doc-staff-1',
    appointmentDate: '2026-08-20',
    startTime: '2026-08-20T09:00:00',
    endTime: '2026-08-20T09:30:00',
    createdBy: 'u1',
    status: 'SCHEDULED',
    ...overrides,
  });
}

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  let createUseCase: { execute: jest.Mock };
  let findByIdUseCase: { execute: jest.Mock };
  let findAllUseCase: { execute: jest.Mock };
  let updateUseCase: { execute: jest.Mock };
  let softDeleteUseCase: { execute: jest.Mock };
  let events: { emit: jest.Mock };
  let prisma: { staffProfiles: { findFirst: jest.Mock } };

  beforeEach(() => {
    createUseCase = { execute: jest.fn() };
    findByIdUseCase = { execute: jest.fn() };
    findAllUseCase = { execute: jest.fn() };
    updateUseCase = { execute: jest.fn() };
    softDeleteUseCase = { execute: jest.fn() };
    events = { emit: jest.fn() };
    prisma = { staffProfiles: { findFirst: jest.fn() } };

    service = new AppointmentsService(
      createUseCase as unknown as CreateAppointmentUseCase,
      findByIdUseCase as unknown as FindAppointmentByIdUseCase,
      findAllUseCase as unknown as FindAllAppointmentsUseCase,
      updateUseCase as unknown as UpdateAppointmentUseCase,
      softDeleteUseCase as unknown as SoftDeleteAppointmentUseCase,
      events as unknown as EventEmitter2,
      prisma as unknown as PrismaService,
    );
  });

  it('creates an appointment and emits created events', async () => {
    const entity = makeAppointment();
    createUseCase.execute.mockResolvedValue(Result.success(entity));
    prisma.staffProfiles.findFirst.mockResolvedValue({ user_id: 'doc-user-1' });

    const res = await service.create({
      patientId: 'pat-1',
      doctorId: 'doc-staff-1',
    } as never);

    expect(res.id).toBe(entity.getId());
    expect(events.emit).toHaveBeenCalledWith(
      APPOINTMENTS_EVENTS.CREATED,
      expect.any(Object),
    );
    expect(events.emit).toHaveBeenCalledWith(
      APPOINTMENT_DOMAIN_EVENTS.CREATED,
      expect.objectContaining({
        payload: expect.objectContaining({
          appointmentId: entity.getId(),
          doctorUserId: 'doc-user-1',
        }),
      }),
    );
  });

  it('findById / findAll / update / softDelete happy paths', async () => {
    const entity = makeAppointment();
    findByIdUseCase.execute.mockResolvedValue(Result.success(entity));
    findAllUseCase.execute.mockResolvedValue(
      Result.success({ items: [entity], total: 1 }),
    );
    updateUseCase.execute.mockResolvedValue(Result.success(entity));
    softDeleteUseCase.execute.mockResolvedValue(Result.success(undefined));

    expect((await service.findById(entity.getId())).id).toBe(entity.getId());
    const page = await service.findAll({ page: 1, limit: 10 } as never);
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(1);

    await service.update(entity.getId(), { notes: 'n' } as never);
    expect(events.emit).toHaveBeenCalledWith(
      APPOINTMENTS_EVENTS.UPDATED,
      expect.any(Object),
    );

    await service.softDelete(entity.getId());
    expect(events.emit).toHaveBeenCalledWith(
      APPOINTMENTS_EVENTS.DELETED,
      expect.any(Object),
    );
  });

  it('cancel / checkIn / reschedule emit domain events', async () => {
    const entity = makeAppointment();
    findByIdUseCase.execute.mockResolvedValue(Result.success(entity));
    updateUseCase.execute.mockResolvedValue(Result.success(entity));
    prisma.staffProfiles.findFirst.mockResolvedValue(null);

    await service.cancel(entity.getId(), { reason: 'busy' } as never);
    expect(updateUseCase.execute).toHaveBeenCalledWith(entity.getId(), {
      status: 'CANCELLED',
    });
    expect(events.emit).toHaveBeenCalledWith(
      APPOINTMENT_DOMAIN_EVENTS.CANCELLED,
      expect.any(Object),
    );

    await service.checkIn(entity.getId(), {} as never);
    expect(updateUseCase.execute).toHaveBeenCalledWith(entity.getId(), {
      status: 'CHECKED_IN',
    });
    expect(events.emit).toHaveBeenCalledWith(
      APPOINTMENT_DOMAIN_EVENTS.CHECKED_IN,
      expect.any(Object),
    );

    await service.reschedule(entity.getId(), {
      appointmentDate: '2026-08-21',
      startTime: '10:00',
      endTime: '10:30',
      notes: 'moved',
    } as never);
    expect(events.emit).toHaveBeenCalledWith(
      APPOINTMENT_DOMAIN_EVENTS.RESCHEDULED,
      expect.any(Object),
    );
  });

  it('unwrap maps NotFound / Validation / generic failures', async () => {
    findByIdUseCase.execute.mockResolvedValue(
      Result.failure(new NotFoundException('missing')),
    );
    await expect(service.findById('x')).rejects.toBeInstanceOf(
      HttpNotFoundException,
    );

    findByIdUseCase.execute.mockResolvedValue(
      Result.failure(new ValidationException('bad')),
    );
    await expect(service.findById('x')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );

    findByIdUseCase.execute.mockResolvedValue(Result.failure('boom'));
    await expect(service.findById('x')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
