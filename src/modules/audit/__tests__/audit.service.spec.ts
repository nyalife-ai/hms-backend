/**
 * File: audit.service.spec.ts
 * Module: audit
 * Purpose: Service smoke unit tests.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditService } from '../audit.service';
import { CreateAuditUseCase } from '../use-cases/create-audit.usecase';
import { FindAuditByIdUseCase } from '../use-cases/find-audit-by-id.usecase';
import { FindAllAuditUseCase } from '../use-cases/find-all-audit.usecase';
import { UpdateAuditUseCase } from '../use-cases/update-audit.usecase';
import { SoftDeleteAuditUseCase } from '../use-cases/soft-delete-audit.usecase';
import { Result } from '../../../core/contracts';

describe('AuditService', () => {
  let service: AuditService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: CreateAuditUseCase, useValue: { execute: jest.fn() } },
        {
          provide: FindAuditByIdUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.failure('missing')) },
        },
        {
          provide: FindAllAuditUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.success({ items: [], total: 0 })) },
        },
        { provide: UpdateAuditUseCase, useValue: { execute: jest.fn() } },
        { provide: SoftDeleteAuditUseCase, useValue: { execute: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(AuditService);
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
