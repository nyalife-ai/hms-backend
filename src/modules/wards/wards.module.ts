/**
 * File: wards.module.ts
 * Module: wards
 * Purpose: Nest module wiring repository factory and use-cases.
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { InpatientModule } from '../inpatient/inpatient.module';
import { WARDS_REPOSITORY } from './constants/wards.constants';
import { WardsController } from './wards.controller';
import { WardsService } from './wards.service';
import { WardsListener } from './listeners/wards.listener';
import { WardRepositoryProvider } from './repositories/wards.repository';
import { PrismaWardRepository } from './repositories/prisma/prisma-ward.repository';
import { CreateWardUseCase } from './use-cases/create-ward.usecase';
import { FindWardByIdUseCase } from './use-cases/find-ward-by-id.usecase';
import { FindAllWardsUseCase } from './use-cases/find-all-wards.usecase';
import { UpdateWardUseCase } from './use-cases/update-ward.usecase';
import { SoftDeleteWardUseCase } from './use-cases/soft-delete-ward.usecase';

@Module({
  imports: [PrismaModule, AuthModule, InpatientModule],
  controllers: [WardsController],
  providers: [
    WardsService,
    WardsListener,
    WardRepositoryProvider,
    PrismaWardRepository,
    CreateWardUseCase,
    FindWardByIdUseCase,
    FindAllWardsUseCase,
    UpdateWardUseCase,
    SoftDeleteWardUseCase,
  ],
  exports: [WardsService, WARDS_REPOSITORY],
})
export class WardsModule {}
