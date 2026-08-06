/**
 * File: vital-signs.module.ts
 * Module: vital-signs
 * Purpose: Nest module wiring repository factory and use-cases.
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { VITAL_SIGNS_REPOSITORY } from './constants/vital-signs.constants';
import { VitalSignsController } from './vital-signs.controller';
import { VitalSignsService } from './vital-signs.service';
import { VitalSignsListener } from './listeners/vital-signs.listener';
import { VitalSignRepositoryProvider } from './repositories/vital-signs.repository';
import { PrismaVitalSignRepository } from './repositories/prisma/prisma-vital-sign.repository';
import { CreateVitalSignUseCase } from './use-cases/create-vital-sign.usecase';
import { FindVitalSignByIdUseCase } from './use-cases/find-vital-sign-by-id.usecase';
import { FindAllVitalSignsUseCase } from './use-cases/find-all-vital-signs.usecase';
import { UpdateVitalSignUseCase } from './use-cases/update-vital-sign.usecase';
import { SoftDeleteVitalSignUseCase } from './use-cases/soft-delete-vital-sign.usecase';

@Module({
  imports: [PrismaModule],
  controllers: [VitalSignsController],
  providers: [
    VitalSignsService,
    VitalSignsListener,
    VitalSignRepositoryProvider,
    PrismaVitalSignRepository,
    CreateVitalSignUseCase,
    FindVitalSignByIdUseCase,
    FindAllVitalSignsUseCase,
    UpdateVitalSignUseCase,
    SoftDeleteVitalSignUseCase,
  ],
  exports: [VitalSignsService, VITAL_SIGNS_REPOSITORY],
})
export class VitalSignsModule {}
