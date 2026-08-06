/**
 * File: procedures.service.spec.ts
 * Module: procedures
 * Purpose: Service smoke unit tests.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProceduresService } from '../procedures.service';
import { CreateProcedureUseCase } from '../use-cases/create-procedure.usecase';
import { FindProcedureByIdUseCase } from '../use-cases/find-procedure-by-id.usecase';
import { FindAllProceduresUseCase } from '../use-cases/find-all-procedures.usecase';
import { UpdateProcedureUseCase } from '../use-cases/update-procedure.usecase';
import { SoftDeleteProcedureUseCase } from '../use-cases/soft-delete-procedure.usecase';
import { Result } from '../../../core/contracts';

describe('ProceduresService', () => {
  let service: ProceduresService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProceduresService,
        { provide: CreateProcedureUseCase, useValue: { execute: jest.fn() } },
        {
          provide: FindProcedureByIdUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.failure('missing')) },
        },
        {
          provide: FindAllProceduresUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.success({ items: [], total: 0 })) },
        },
        { provide: UpdateProcedureUseCase, useValue: { execute: jest.fn() } },
        { provide: SoftDeleteProcedureUseCase, useValue: { execute: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(ProceduresService);
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
