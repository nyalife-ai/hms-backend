/**
 * File: diagnoses.service.spec.ts
 * Module: diagnoses
 * Purpose: Service smoke unit tests.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DiagnosesService } from '../diagnoses.service';
import { CreateDiagnosUseCase } from '../use-cases/create-diagnos.usecase';
import { FindDiagnosByIdUseCase } from '../use-cases/find-diagnos-by-id.usecase';
import { FindAllDiagnosesUseCase } from '../use-cases/find-all-diagnoses.usecase';
import { UpdateDiagnosUseCase } from '../use-cases/update-diagnos.usecase';
import { SoftDeleteDiagnosUseCase } from '../use-cases/soft-delete-diagnos.usecase';
import { Result } from '../../../core/contracts';

describe('DiagnosesService', () => {
  let service: DiagnosesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiagnosesService,
        { provide: CreateDiagnosUseCase, useValue: { execute: jest.fn() } },
        {
          provide: FindDiagnosByIdUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.failure('missing')) },
        },
        {
          provide: FindAllDiagnosesUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.success({ items: [], total: 0 })) },
        },
        { provide: UpdateDiagnosUseCase, useValue: { execute: jest.fn() } },
        { provide: SoftDeleteDiagnosUseCase, useValue: { execute: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(DiagnosesService);
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
