/**
 * File: prescriptions.service.spec.ts
 * Module: prescriptions
 * Purpose: Service smoke unit tests.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrescriptionsService } from '../prescriptions.service';
import { CreatePrescriptionUseCase } from '../use-cases/create-prescription.usecase';
import { FindPrescriptionByIdUseCase } from '../use-cases/find-prescription-by-id.usecase';
import { FindAllPrescriptionsUseCase } from '../use-cases/find-all-prescriptions.usecase';
import { UpdatePrescriptionUseCase } from '../use-cases/update-prescription.usecase';
import { SoftDeletePrescriptionUseCase } from '../use-cases/soft-delete-prescription.usecase';
import { Result } from '../../../core/contracts';

describe('PrescriptionsService', () => {
  let service: PrescriptionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrescriptionsService,
        { provide: CreatePrescriptionUseCase, useValue: { execute: jest.fn() } },
        {
          provide: FindPrescriptionByIdUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.failure('missing')) },
        },
        {
          provide: FindAllPrescriptionsUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.success({ items: [], total: 0 })) },
        },
        { provide: UpdatePrescriptionUseCase, useValue: { execute: jest.fn() } },
        { provide: SoftDeletePrescriptionUseCase, useValue: { execute: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(PrescriptionsService);
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
