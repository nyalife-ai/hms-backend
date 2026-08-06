/**
 * File: patients.service.spec.ts
 */

import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { Result } from '../../../core/contracts';
import { Patient } from '../domain/patient.entity';
import { PatientsService } from '../patients.service';
import { CreatePatientUseCase } from '../use-cases/create-patient.usecase';
import { FindPatientByIdUseCase } from '../use-cases/find-patient-by-id.usecase';
import { FindAllPatientsUseCase } from '../use-cases/find-all-patients.usecase';
import { UpdatePatientUseCase } from '../use-cases/update-patient.usecase';
import { SoftDeletePatientUseCase } from '../use-cases/soft-delete-patient.usecase';

describe('PatientsService', () => {
  let service: PatientsService;
  const sample = Patient.create({
    userId: 'u1',
    patientNumber: 'MRN-10001',
    firstName: 'Amina',
    lastName: 'Okello',
  });

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PatientsService,
        {
          provide: CreatePatientUseCase,
          useValue: {
            execute: jest.fn().mockResolvedValue(Result.success(sample)),
          },
        },
        {
          provide: FindPatientByIdUseCase,
          useValue: {
            execute: jest.fn().mockResolvedValue(Result.success(sample)),
          },
        },
        {
          provide: FindAllPatientsUseCase,
          useValue: {
            execute: jest
              .fn()
              .mockResolvedValue(Result.success({ items: [sample], total: 1 })),
          },
        },
        {
          provide: UpdatePatientUseCase,
          useValue: {
            execute: jest.fn().mockResolvedValue(Result.success(sample)),
          },
        },
        {
          provide: SoftDeletePatientUseCase,
          useValue: {
            execute: jest.fn().mockResolvedValue(Result.success(undefined)),
          },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(PatientsService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  it('creates and maps response', async () => {
    const res = await service.create({
      firstName: 'Amina',
      lastName: 'Okello',
    });
    expect(res.patientNumber).toBe('MRN-10001');
    expect(res.name).toBe('Amina Okello');
  });

  it('lists with pagination metadata', async () => {
    const res = await service.findAll({ page: 1, limit: 20 });
    expect(res.total).toBe(1);
    expect(res.items).toHaveLength(1);
  });
});
