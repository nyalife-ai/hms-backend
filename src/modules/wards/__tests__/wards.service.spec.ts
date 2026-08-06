/**
 * File: wards.service.spec.ts
 * Module: wards
 * Purpose: Service smoke unit tests.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WardsService } from '../wards.service';
import { CreateWardUseCase } from '../use-cases/create-ward.usecase';
import { FindWardByIdUseCase } from '../use-cases/find-ward-by-id.usecase';
import { FindAllWardsUseCase } from '../use-cases/find-all-wards.usecase';
import { UpdateWardUseCase } from '../use-cases/update-ward.usecase';
import { SoftDeleteWardUseCase } from '../use-cases/soft-delete-ward.usecase';
import { Result } from '../../../core/contracts';

describe('WardsService', () => {
  let service: WardsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WardsService,
        { provide: CreateWardUseCase, useValue: { execute: jest.fn() } },
        {
          provide: FindWardByIdUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.failure('missing')) },
        },
        {
          provide: FindAllWardsUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.success({ items: [], total: 0 })) },
        },
        { provide: UpdateWardUseCase, useValue: { execute: jest.fn() } },
        { provide: SoftDeleteWardUseCase, useValue: { execute: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(WardsService);
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
