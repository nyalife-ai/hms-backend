/**
 * File: beds.service.spec.ts
 * Module: beds
 * Purpose: Service smoke unit tests.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BedsService } from '../beds.service';
import { CreateBedUseCase } from '../use-cases/create-bed.usecase';
import { FindBedByIdUseCase } from '../use-cases/find-bed-by-id.usecase';
import { FindAllBedsUseCase } from '../use-cases/find-all-beds.usecase';
import { UpdateBedUseCase } from '../use-cases/update-bed.usecase';
import { SoftDeleteBedUseCase } from '../use-cases/soft-delete-bed.usecase';
import { Result } from '../../../core/contracts';

describe('BedsService', () => {
  let service: BedsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BedsService,
        { provide: CreateBedUseCase, useValue: { execute: jest.fn() } },
        {
          provide: FindBedByIdUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.failure('missing')) },
        },
        {
          provide: FindAllBedsUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.success({ items: [], total: 0 })) },
        },
        { provide: UpdateBedUseCase, useValue: { execute: jest.fn() } },
        { provide: SoftDeleteBedUseCase, useValue: { execute: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(BedsService);
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
