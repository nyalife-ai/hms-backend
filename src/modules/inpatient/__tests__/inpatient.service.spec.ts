/**
 * File: inpatient.service.spec.ts
 * Module: inpatient
 * Purpose: Service smoke unit tests.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InpatientService } from '../inpatient.service';
import { CreateInpatientUseCase } from '../use-cases/create-inpatient.usecase';
import { FindInpatientByIdUseCase } from '../use-cases/find-inpatient-by-id.usecase';
import { FindAllInpatientUseCase } from '../use-cases/find-all-inpatient.usecase';
import { UpdateInpatientUseCase } from '../use-cases/update-inpatient.usecase';
import { SoftDeleteInpatientUseCase } from '../use-cases/soft-delete-inpatient.usecase';
import { Result } from '../../../core/contracts';

describe('InpatientService', () => {
  let service: InpatientService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InpatientService,
        { provide: CreateInpatientUseCase, useValue: { execute: jest.fn() } },
        {
          provide: FindInpatientByIdUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.failure('missing')) },
        },
        {
          provide: FindAllInpatientUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.success({ items: [], total: 0 })) },
        },
        { provide: UpdateInpatientUseCase, useValue: { execute: jest.fn() } },
        { provide: SoftDeleteInpatientUseCase, useValue: { execute: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(InpatientService);
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
