/**
 * File: medications.module.ts
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PharmacyModule } from '../pharmacy/pharmacy.module';
import { MEDICATIONS_REPOSITORY } from './constants/medications.constants';
import { MedicationsController } from './medications.controller';
import { MedicationsService } from './medications.service';
import { MedicationsListener } from './listeners/medications.listener';
import { MedicationRepositoryProvider } from './repositories/medications.repository';
import { PrismaMedicationRepository } from './repositories/prisma/prisma-medication.repository';
import { CreateMedicationUseCase } from './use-cases/create-medication.usecase';
import { FindMedicationByIdUseCase } from './use-cases/find-medication-by-id.usecase';
import { FindAllMedicationsUseCase } from './use-cases/find-all-medications.usecase';
import { UpdateMedicationUseCase } from './use-cases/update-medication.usecase';
import { SoftDeleteMedicationUseCase } from './use-cases/soft-delete-medication.usecase';

@Module({
  imports: [PrismaModule, AuthModule, PharmacyModule],
  controllers: [MedicationsController],
  providers: [
    MedicationsService,
    MedicationsListener,
    MedicationRepositoryProvider,
    PrismaMedicationRepository,
    CreateMedicationUseCase,
    FindMedicationByIdUseCase,
    FindAllMedicationsUseCase,
    UpdateMedicationUseCase,
    SoftDeleteMedicationUseCase,
  ],
  exports: [MedicationsService, MEDICATIONS_REPOSITORY],
})
export class MedicationsModule {}
