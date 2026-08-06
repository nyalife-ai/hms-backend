/**
 * File: admissions.service.spec.ts
 * Module: admissions
 * Purpose: Service smoke unit tests.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AdmissionsService } from '../admissions.service';
import { CreateAdmissionUseCase } from '../use-cases/create-admission.usecase';
import { FindAdmissionByIdUseCase } from '../use-cases/find-admission-by-id.usecase';
import { FindAllAdmissionsUseCase } from '../use-cases/find-all-admissions.usecase';
import { UpdateAdmissionUseCase } from '../use-cases/update-admission.usecase';
import { SoftDeleteAdmissionUseCase } from '../use-cases/soft-delete-admission.usecase';
import { Result } from '../../../core/contracts';

describe('AdmissionsService', () => {
  let service: AdmissionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdmissionsService,
        { provide: CreateAdmissionUseCase, useValue: { execute: jest.fn() } },
        {
          provide: FindAdmissionByIdUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.failure('missing')) },
        },
        {
          provide: FindAllAdmissionsUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.success({ items: [], total: 0 })) },
        },
        { provide: UpdateAdmissionUseCase, useValue: { execute: jest.fn() } },
        { provide: SoftDeleteAdmissionUseCase, useValue: { execute: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(AdmissionsService);
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
