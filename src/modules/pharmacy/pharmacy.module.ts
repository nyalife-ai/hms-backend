/**
 * File: pharmacy.module.ts
 * Module: pharmacy
 * Purpose: Nest module wiring repository factory and use-cases.
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { PHARMACY_REPOSITORY } from './constants/pharmacy.constants';
import { PharmacyController } from './pharmacy.controller';
import { PharmacyService } from './pharmacy.service';
import { PharmacyListener } from './listeners/pharmacy.listener';
import { PharmacyRepositoryProvider } from './repositories/pharmacy.repository';
import { PrismaPharmacyRepository } from './repositories/prisma/prisma-pharmacy.repository';
import { CreatePharmacyUseCase } from './use-cases/create-pharmacy.usecase';
import { FindPharmacyByIdUseCase } from './use-cases/find-pharmacy-by-id.usecase';
import { FindAllPharmacyUseCase } from './use-cases/find-all-pharmacy.usecase';
import { UpdatePharmacyUseCase } from './use-cases/update-pharmacy.usecase';
import { SoftDeletePharmacyUseCase } from './use-cases/soft-delete-pharmacy.usecase';
import { DispenseMedicationUseCase } from './use-cases/dispense-medication.usecase';
import { PharmacyOperationsUseCase } from './use-cases/pharmacy-operations.usecase';
import { PharmacyJourneyUseCase } from './use-cases/pharmacy-journey.usecase';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule],
  controllers: [PharmacyController],
  providers: [
    PharmacyService,
    PharmacyListener,
    PharmacyRepositoryProvider,
    PrismaPharmacyRepository,
    CreatePharmacyUseCase,
    FindPharmacyByIdUseCase,
    FindAllPharmacyUseCase,
    UpdatePharmacyUseCase,
    SoftDeletePharmacyUseCase,
    DispenseMedicationUseCase,
    PharmacyOperationsUseCase,
    PharmacyJourneyUseCase,
  ],
  exports: [
    PharmacyService,
    DispenseMedicationUseCase,
    PharmacyOperationsUseCase,
    PharmacyJourneyUseCase,
    PHARMACY_REPOSITORY,
  ],
})
export class PharmacyModule {}
