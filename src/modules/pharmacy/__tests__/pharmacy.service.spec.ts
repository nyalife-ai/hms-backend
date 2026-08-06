/**
 * File: pharmacy.service.spec.ts
 * Module: pharmacy
 * Purpose: Service smoke unit tests.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PharmacyService } from '../pharmacy.service';
import { CreatePharmacyUseCase } from '../use-cases/create-pharmacy.usecase';
import { FindPharmacyByIdUseCase } from '../use-cases/find-pharmacy-by-id.usecase';
import { FindAllPharmacyUseCase } from '../use-cases/find-all-pharmacy.usecase';
import { UpdatePharmacyUseCase } from '../use-cases/update-pharmacy.usecase';
import { SoftDeletePharmacyUseCase } from '../use-cases/soft-delete-pharmacy.usecase';
import { Result } from '../../../core/contracts';

describe('PharmacyService', () => {
  let service: PharmacyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PharmacyService,
        { provide: CreatePharmacyUseCase, useValue: { execute: jest.fn() } },
        {
          provide: FindPharmacyByIdUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.failure('missing')) },
        },
        {
          provide: FindAllPharmacyUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.success({ items: [], total: 0 })) },
        },
        { provide: UpdatePharmacyUseCase, useValue: { execute: jest.fn() } },
        { provide: SoftDeletePharmacyUseCase, useValue: { execute: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(PharmacyService);
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
