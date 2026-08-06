/**
 * File: beds.module.ts
 * Module: beds
 * Purpose: Nest module wiring repository factory and use-cases.
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { InpatientModule } from '../inpatient/inpatient.module';
import { BEDS_REPOSITORY } from './constants/beds.constants';
import { BedsController } from './beds.controller';
import { BedsService } from './beds.service';
import { BedsListener } from './listeners/beds.listener';
import { BedRepositoryProvider } from './repositories/beds.repository';
import { PrismaBedRepository } from './repositories/prisma/prisma-bed.repository';
import { CreateBedUseCase } from './use-cases/create-bed.usecase';
import { FindBedByIdUseCase } from './use-cases/find-bed-by-id.usecase';
import { FindAllBedsUseCase } from './use-cases/find-all-beds.usecase';
import { UpdateBedUseCase } from './use-cases/update-bed.usecase';
import { SoftDeleteBedUseCase } from './use-cases/soft-delete-bed.usecase';

@Module({
  imports: [PrismaModule, AuthModule, InpatientModule],
  controllers: [BedsController],
  providers: [
    BedsService,
    BedsListener,
    BedRepositoryProvider,
    PrismaBedRepository,
    CreateBedUseCase,
    FindBedByIdUseCase,
    FindAllBedsUseCase,
    UpdateBedUseCase,
    SoftDeleteBedUseCase,
  ],
  exports: [BedsService, BEDS_REPOSITORY],
})
export class BedsModule {}
