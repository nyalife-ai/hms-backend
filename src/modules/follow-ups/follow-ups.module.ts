/**
 * File: follow-ups.module.ts
 * Module: follow-ups
 * Purpose: Nest module wiring repository factory and use-cases.
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { FOLLOW_UPS_REPOSITORY } from './constants/follow-ups.constants';
import { FollowUpsController } from './follow-ups.controller';
import { FollowUpsService } from './follow-ups.service';
import { FollowUpsListener } from './listeners/follow-ups.listener';
import { FollowUpRepositoryProvider } from './repositories/follow-ups.repository';
import { PrismaFollowUpRepository } from './repositories/prisma/prisma-follow-up.repository';
import { CreateFollowUpUseCase } from './use-cases/create-follow-up.usecase';
import { FindFollowUpByIdUseCase } from './use-cases/find-follow-up-by-id.usecase';
import { FindAllFollowUpsUseCase } from './use-cases/find-all-follow-ups.usecase';
import { UpdateFollowUpUseCase } from './use-cases/update-follow-up.usecase';
import { SoftDeleteFollowUpUseCase } from './use-cases/soft-delete-follow-up.usecase';

@Module({
  imports: [PrismaModule],
  controllers: [FollowUpsController],
  providers: [
    FollowUpsService,
    FollowUpsListener,
    FollowUpRepositoryProvider,
    PrismaFollowUpRepository,
    CreateFollowUpUseCase,
    FindFollowUpByIdUseCase,
    FindAllFollowUpsUseCase,
    UpdateFollowUpUseCase,
    SoftDeleteFollowUpUseCase,
  ],
  exports: [FollowUpsService, FOLLOW_UPS_REPOSITORY],
})
export class FollowUpsModule {}
