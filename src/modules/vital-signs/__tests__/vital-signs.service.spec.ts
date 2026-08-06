/**
 * File: vital-signs.service.spec.ts
 * Module: vital-signs
 * Purpose: Service smoke unit tests.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { VitalSignsService } from '../vital-signs.service';
import { CreateVitalSignUseCase } from '../use-cases/create-vital-sign.usecase';
import { FindVitalSignByIdUseCase } from '../use-cases/find-vital-sign-by-id.usecase';
import { FindAllVitalSignsUseCase } from '../use-cases/find-all-vital-signs.usecase';
import { UpdateVitalSignUseCase } from '../use-cases/update-vital-sign.usecase';
import { SoftDeleteVitalSignUseCase } from '../use-cases/soft-delete-vital-sign.usecase';
import { Result } from '../../../core/contracts';

describe('VitalSignsService', () => {
  let service: VitalSignsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VitalSignsService,
        { provide: CreateVitalSignUseCase, useValue: { execute: jest.fn() } },
        {
          provide: FindVitalSignByIdUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.failure('missing')) },
        },
        {
          provide: FindAllVitalSignsUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.success({ items: [], total: 0 })) },
        },
        { provide: UpdateVitalSignUseCase, useValue: { execute: jest.fn() } },
        { provide: SoftDeleteVitalSignUseCase, useValue: { execute: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(VitalSignsService);
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
