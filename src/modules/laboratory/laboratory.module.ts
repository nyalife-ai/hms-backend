/**
 * File: laboratory.module.ts
 * Module: laboratory
 * Purpose: Nest module wiring repository factory and use-cases.
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { LABORATORY_REPOSITORY } from './constants/laboratory.constants';
import { LaboratoryController } from './laboratory.controller';
import { LaboratoryService } from './laboratory.service';
import { LaboratoryListener } from './listeners/laboratory.listener';
import { LaboratoryRepositoryProvider } from './repositories/laboratory.repository';
import { PrismaLaboratoryRepository } from './repositories/prisma/prisma-laboratory.repository';
import { CreateLaboratoryUseCase } from './use-cases/create-laboratory.usecase';
import { FindLaboratoryByIdUseCase } from './use-cases/find-laboratory-by-id.usecase';
import { FindAllLaboratoryUseCase } from './use-cases/find-all-laboratory.usecase';
import { UpdateLaboratoryUseCase } from './use-cases/update-laboratory.usecase';
import { SoftDeleteLaboratoryUseCase } from './use-cases/soft-delete-laboratory.usecase';
import { LabJourneyUseCase } from './use-cases/lab-journey.usecase';
import { LabOperationsUseCase } from './use-cases/lab-operations.usecase';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule],
  controllers: [LaboratoryController],
  providers: [
    LaboratoryService,
    LaboratoryListener,
    LaboratoryRepositoryProvider,
    PrismaLaboratoryRepository,
    CreateLaboratoryUseCase,
    FindLaboratoryByIdUseCase,
    FindAllLaboratoryUseCase,
    UpdateLaboratoryUseCase,
    SoftDeleteLaboratoryUseCase,
    LabOperationsUseCase,
    LabJourneyUseCase,
  ],
  exports: [
    LaboratoryService,
    LabOperationsUseCase,
    LabJourneyUseCase,
    LABORATORY_REPOSITORY,
  ],
})
export class LaboratoryModule {}
