/**
 * File: medications.service.spec.ts
 * Module: medications
 * Purpose: Service smoke unit tests.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MedicationsService } from '../medications.service';
import { CreateMedicationUseCase } from '../use-cases/create-medication.usecase';
import { FindMedicationByIdUseCase } from '../use-cases/find-medication-by-id.usecase';
import { FindAllMedicationsUseCase } from '../use-cases/find-all-medications.usecase';
import { UpdateMedicationUseCase } from '../use-cases/update-medication.usecase';
import { SoftDeleteMedicationUseCase } from '../use-cases/soft-delete-medication.usecase';
import { Result } from '../../../core/contracts';

describe('MedicationsService', () => {
  let service: MedicationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MedicationsService,
        { provide: CreateMedicationUseCase, useValue: { execute: jest.fn() } },
        {
          provide: FindMedicationByIdUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.failure('missing')) },
        },
        {
          provide: FindAllMedicationsUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.success({ items: [], total: 0 })) },
        },
        { provide: UpdateMedicationUseCase, useValue: { execute: jest.fn() } },
        { provide: SoftDeleteMedicationUseCase, useValue: { execute: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(MedicationsService);
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
