/**
 * File: departments.service.spec.ts
 * Module: departments
 * Purpose: Service smoke unit tests.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DepartmentsService } from '../departments.service';
import { CreateDepartmentUseCase } from '../use-cases/create-department.usecase';
import { FindDepartmentByIdUseCase } from '../use-cases/find-department-by-id.usecase';
import { FindAllDepartmentsUseCase } from '../use-cases/find-all-departments.usecase';
import { UpdateDepartmentUseCase } from '../use-cases/update-department.usecase';
import { SoftDeleteDepartmentUseCase } from '../use-cases/soft-delete-department.usecase';
import { Result } from '../../../core/contracts';

describe('DepartmentsService', () => {
  let service: DepartmentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DepartmentsService,
        { provide: CreateDepartmentUseCase, useValue: { execute: jest.fn() } },
        {
          provide: FindDepartmentByIdUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.failure('missing')) },
        },
        {
          provide: FindAllDepartmentsUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.success({ items: [], total: 0 })) },
        },
        { provide: UpdateDepartmentUseCase, useValue: { execute: jest.fn() } },
        { provide: SoftDeleteDepartmentUseCase, useValue: { execute: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(DepartmentsService);
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
