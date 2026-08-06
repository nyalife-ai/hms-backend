/**
 * File: radiology.module.ts
 * Module: radiology
 * Purpose: Nest module wiring repository factory and use-cases.
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { RADIOLOGY_REPOSITORY } from './constants/radiology.constants';
import { RadiologyController } from './radiology.controller';
import { RadiologyService } from './radiology.service';
import { RadiologyListener } from './listeners/radiology.listener';
import { RadiologyRepositoryProvider } from './repositories/radiology.repository';
import { PrismaRadiologyRepository } from './repositories/prisma/prisma-radiology.repository';
import { CreateRadiologyUseCase } from './use-cases/create-radiology.usecase';
import { FindRadiologyByIdUseCase } from './use-cases/find-radiology-by-id.usecase';
import { FindAllRadiologyUseCase } from './use-cases/find-all-radiology.usecase';
import { UpdateRadiologyUseCase } from './use-cases/update-radiology.usecase';
import { SoftDeleteRadiologyUseCase } from './use-cases/soft-delete-radiology.usecase';

@Module({
  imports: [PrismaModule],
  controllers: [RadiologyController],
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
  ],
  exports: [RadiologyService, RADIOLOGY_REPOSITORY],
})
export class RadiologyModule {}
