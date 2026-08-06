/**
 * File: insurance-policies.service.spec.ts
 * Module: insurance-policies
 * Purpose: Service smoke unit tests.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InsurancePoliciesService } from '../insurance-policies.service';
import { CreateInsurancePolicyUseCase } from '../use-cases/create-insurance-policy.usecase';
import { FindInsurancePolicyByIdUseCase } from '../use-cases/find-insurance-policy-by-id.usecase';
import { FindAllInsurancePoliciesUseCase } from '../use-cases/find-all-insurance-policies.usecase';
import { UpdateInsurancePolicyUseCase } from '../use-cases/update-insurance-policy.usecase';
import { SoftDeleteInsurancePolicyUseCase } from '../use-cases/soft-delete-insurance-policy.usecase';
import { Result } from '../../../core/contracts';

describe('InsurancePoliciesService', () => {
  let service: InsurancePoliciesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InsurancePoliciesService,
        { provide: CreateInsurancePolicyUseCase, useValue: { execute: jest.fn() } },
        {
          provide: FindInsurancePolicyByIdUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.failure('missing')) },
        },
        {
          provide: FindAllInsurancePoliciesUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.success({ items: [], total: 0 })) },
        },
        { provide: UpdateInsurancePolicyUseCase, useValue: { execute: jest.fn() } },
        { provide: SoftDeleteInsurancePolicyUseCase, useValue: { execute: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(InsurancePoliciesService);
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
