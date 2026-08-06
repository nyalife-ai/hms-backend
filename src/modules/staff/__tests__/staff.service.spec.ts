/**
 * File: staff.service.spec.ts
 * Module: staff
 * Purpose: Service smoke unit tests.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StaffService } from '../staff.service';
import { CreateStaffUseCase } from '../use-cases/create-staff.usecase';
import { FindStaffByIdUseCase } from '../use-cases/find-staff-by-id.usecase';
import { FindAllStaffUseCase } from '../use-cases/find-all-staff.usecase';
import { UpdateStaffUseCase } from '../use-cases/update-staff.usecase';
import { SoftDeleteStaffUseCase } from '../use-cases/soft-delete-staff.usecase';
import { Result } from '../../../core/contracts';

describe('StaffService', () => {
  let service: StaffService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffService,
        { provide: CreateStaffUseCase, useValue: { execute: jest.fn() } },
        {
          provide: FindStaffByIdUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.failure('missing')) },
        },
        {
          provide: FindAllStaffUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.success({ items: [], total: 0 })) },
        },
        { provide: UpdateStaffUseCase, useValue: { execute: jest.fn() } },
        { provide: SoftDeleteStaffUseCase, useValue: { execute: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(StaffService);
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
