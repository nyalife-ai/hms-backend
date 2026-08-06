/**
 * File: prescriptions.module.ts
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PharmacyModule } from '../pharmacy/pharmacy.module';
import { PRESCRIPTIONS_REPOSITORY } from './constants/prescriptions.constants';
import { PrescriptionsController } from './prescriptions.controller';
import { PrescriptionsService } from './prescriptions.service';
import { PrescriptionsListener } from './listeners/prescriptions.listener';
import { PrescriptionRepositoryProvider } from './repositories/prescriptions.repository';
import { PrismaPrescriptionRepository } from './repositories/prisma/prisma-prescription.repository';
import { CreatePrescriptionUseCase } from './use-cases/create-prescription.usecase';
import { FindPrescriptionByIdUseCase } from './use-cases/find-prescription-by-id.usecase';
import { FindAllPrescriptionsUseCase } from './use-cases/find-all-prescriptions.usecase';
import { UpdatePrescriptionUseCase } from './use-cases/update-prescription.usecase';
import { SoftDeletePrescriptionUseCase } from './use-cases/soft-delete-prescription.usecase';

@Module({
  imports: [PrismaModule, AuthModule, PharmacyModule],
  controllers: [PrescriptionsController],
  providers: [
    PrescriptionsService,
    PrescriptionsListener,
    PrescriptionRepositoryProvider,
    PrismaPrescriptionRepository,
    CreatePrescriptionUseCase,
    FindPrescriptionByIdUseCase,
    FindAllPrescriptionsUseCase,
    UpdatePrescriptionUseCase,
    SoftDeletePrescriptionUseCase,
  ],
  exports: [PrescriptionsService, PRESCRIPTIONS_REPOSITORY],
})
export class PrescriptionsModule {}
