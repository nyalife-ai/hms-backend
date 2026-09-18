/**
 * File: radiology.module.ts
 * Module: radiology
 * Purpose: Nest module wiring repository factory and use-cases.
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { RADIOLOGY_REPOSITORY } from './constants/radiology.constants';
import { ImagingController } from './imaging.controller';
import { RadiologyService } from './radiology.service';
import { RadiologyListener } from './listeners/radiology.listener';
import { RadiologyRepositoryProvider } from './repositories/radiology.repository';
import { PrismaRadiologyRepository } from './repositories/prisma/prisma-radiology.repository';
import { CreateRadiologyUseCase } from './use-cases/create-radiology.usecase';
import { FindRadiologyByIdUseCase } from './use-cases/find-radiology-by-id.usecase';
import { FindAllRadiologyUseCase } from './use-cases/find-all-radiology.usecase';
import { UpdateRadiologyUseCase } from './use-cases/update-radiology.usecase';
import { SoftDeleteRadiologyUseCase } from './use-cases/soft-delete-radiology.usecase';
import { RadiologyOperationsUseCase } from './use-cases/radiology-operations.usecase';
import { RadiologyJourneyUseCase } from './use-cases/radiology-journey.usecase';

// RadiologyController (the generic scaffold CRUD) is intentionally not
// registered — its unvalidated status PATCH let any string through,
// bypassing the real state machine. Kept as a file for scaffold parity,
// same as the equivalent dead Laboratory scaffold controller.
@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [ImagingController],
  providers: [
    RadiologyService,
    RadiologyListener,
    RadiologyRepositoryProvider,
    PrismaRadiologyRepository,
    CreateRadiologyUseCase,
    FindRadiologyByIdUseCase,
    FindAllRadiologyUseCase,
    UpdateRadiologyUseCase,
    SoftDeleteRadiologyUseCase,
    RadiologyOperationsUseCase,
    RadiologyJourneyUseCase,
  ],
  exports: [RadiologyService, RADIOLOGY_REPOSITORY, RadiologyJourneyUseCase, RadiologyOperationsUseCase],
})
export class RadiologyModule {}
