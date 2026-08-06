/**
 * File: radiology.service.spec.ts
 * Module: radiology
 * Purpose: Service smoke unit tests.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RadiologyService } from '../radiology.service';
import { CreateRadiologyUseCase } from '../use-cases/create-radiology.usecase';
import { FindRadiologyByIdUseCase } from '../use-cases/find-radiology-by-id.usecase';
import { FindAllRadiologyUseCase } from '../use-cases/find-all-radiology.usecase';
import { UpdateRadiologyUseCase } from '../use-cases/update-radiology.usecase';
import { SoftDeleteRadiologyUseCase } from '../use-cases/soft-delete-radiology.usecase';
import { Result } from '../../../core/contracts';

describe('RadiologyService', () => {
  let service: RadiologyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RadiologyService,
        { provide: CreateRadiologyUseCase, useValue: { execute: jest.fn() } },
        {
          provide: FindRadiologyByIdUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.failure('missing')) },
        },
        {
          provide: FindAllRadiologyUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.success({ items: [], total: 0 })) },
        },
        { provide: UpdateRadiologyUseCase, useValue: { execute: jest.fn() } },
        { provide: SoftDeleteRadiologyUseCase, useValue: { execute: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(RadiologyService);
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
