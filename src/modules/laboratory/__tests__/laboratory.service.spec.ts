/**
 * File: laboratory.service.spec.ts
 * Module: laboratory
 * Purpose: Service smoke unit tests.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LaboratoryService } from '../laboratory.service';
import { CreateLaboratoryUseCase } from '../use-cases/create-laboratory.usecase';
import { FindLaboratoryByIdUseCase } from '../use-cases/find-laboratory-by-id.usecase';
import { FindAllLaboratoryUseCase } from '../use-cases/find-all-laboratory.usecase';
import { UpdateLaboratoryUseCase } from '../use-cases/update-laboratory.usecase';
import { SoftDeleteLaboratoryUseCase } from '../use-cases/soft-delete-laboratory.usecase';
import { Result } from '../../../core/contracts';

describe('LaboratoryService', () => {
  let service: LaboratoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LaboratoryService,
        { provide: CreateLaboratoryUseCase, useValue: { execute: jest.fn() } },
        {
          provide: FindLaboratoryByIdUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.failure('missing')) },
        },
        {
          provide: FindAllLaboratoryUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.success({ items: [], total: 0 })) },
        },
        { provide: UpdateLaboratoryUseCase, useValue: { execute: jest.fn() } },
        { provide: SoftDeleteLaboratoryUseCase, useValue: { execute: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(LaboratoryService);
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
