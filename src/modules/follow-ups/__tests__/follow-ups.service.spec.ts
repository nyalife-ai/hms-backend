/**
 * File: follow-ups.service.spec.ts
 * Module: follow-ups
 * Purpose: Service smoke unit tests.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { FollowUpsService } from '../follow-ups.service';
import { CreateFollowUpUseCase } from '../use-cases/create-follow-up.usecase';
import { FindFollowUpByIdUseCase } from '../use-cases/find-follow-up-by-id.usecase';
import { FindAllFollowUpsUseCase } from '../use-cases/find-all-follow-ups.usecase';
import { UpdateFollowUpUseCase } from '../use-cases/update-follow-up.usecase';
import { SoftDeleteFollowUpUseCase } from '../use-cases/soft-delete-follow-up.usecase';
import { FOLLOW_UPS_REPOSITORY } from '../constants/follow-ups.constants';
import { Result } from '../../../core/contracts';

describe('FollowUpsService', () => {
  let service: FollowUpsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FollowUpsService,
        { provide: CreateFollowUpUseCase, useValue: { execute: jest.fn() } },
        {
          provide: FindFollowUpByIdUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.failure('missing')) },
        },
        {
          provide: FindAllFollowUpsUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.success({ items: [], total: 0 })) },
        },
        { provide: UpdateFollowUpUseCase, useValue: { execute: jest.fn() } },
        { provide: SoftDeleteFollowUpUseCase, useValue: { execute: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: PrismaService,
          useValue: { staffProfiles: { findFirst: jest.fn() } },
        },
        {
          provide: FOLLOW_UPS_REPOSITORY,
          useValue: {
            getSummary: jest.fn().mockResolvedValue({
              scheduledThisMonth: 0,
              completedThisMonth: 0,
              dueWithin7Days: 0,
              overdue: 0,
            }),
          },
        },
      ],
    }).compile();

    service = module.get(FollowUpsService);
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
