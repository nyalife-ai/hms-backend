/**
 * File: consultations.service.spec.ts
 * Module: consultations
 * Purpose: Service smoke unit tests.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConsultationsService } from '../consultations.service';
import { CreateConsultationUseCase } from '../use-cases/create-consultation.usecase';
import { FindConsultationByIdUseCase } from '../use-cases/find-consultation-by-id.usecase';
import { FindAllConsultationsUseCase } from '../use-cases/find-all-consultations.usecase';
import { UpdateConsultationUseCase } from '../use-cases/update-consultation.usecase';
import { SoftDeleteConsultationUseCase } from '../use-cases/soft-delete-consultation.usecase';
import { Result } from '../../../core/contracts';

describe('ConsultationsService', () => {
  let service: ConsultationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsultationsService,
        { provide: CreateConsultationUseCase, useValue: { execute: jest.fn() } },
        {
          provide: FindConsultationByIdUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.failure('missing')) },
        },
        {
          provide: FindAllConsultationsUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.success({ items: [], total: 0 })) },
        },
        { provide: UpdateConsultationUseCase, useValue: { execute: jest.fn() } },
        { provide: SoftDeleteConsultationUseCase, useValue: { execute: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(ConsultationsService);
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
