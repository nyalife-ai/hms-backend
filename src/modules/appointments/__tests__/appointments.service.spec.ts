/**
 * File: appointments.service.spec.ts
 * Module: appointments
 * Purpose: Service smoke unit tests.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppointmentsService } from '../appointments.service';
import { CreateAppointmentUseCase } from '../use-cases/create-appointment.usecase';
import { FindAppointmentByIdUseCase } from '../use-cases/find-appointment-by-id.usecase';
import { FindAllAppointmentsUseCase } from '../use-cases/find-all-appointments.usecase';
import { UpdateAppointmentUseCase } from '../use-cases/update-appointment.usecase';
import { SoftDeleteAppointmentUseCase } from '../use-cases/soft-delete-appointment.usecase';
import { Result } from '../../../core/contracts';

describe('AppointmentsService', () => {
  let service: AppointmentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: CreateAppointmentUseCase, useValue: { execute: jest.fn() } },
        {
          provide: FindAppointmentByIdUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.failure('missing')) },
        },
        {
          provide: FindAllAppointmentsUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.success({ items: [], total: 0 })) },
        },
        { provide: UpdateAppointmentUseCase, useValue: { execute: jest.fn() } },
        { provide: SoftDeleteAppointmentUseCase, useValue: { execute: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(AppointmentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAll returns paginated payload', async () => {
    const res = await service.findAll({ page: 1, limit: 10 });
    expect(res.total).toBe(0);
    expect(res.items).toEqual([]);
  });
});
