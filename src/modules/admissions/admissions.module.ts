/**
 * File: admissions.module.ts
 * Module: admissions
 * Purpose: Nest module wiring repository factory and use-cases.
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { InpatientModule } from '../inpatient/inpatient.module';
import { ADMISSIONS_REPOSITORY } from './constants/admissions.constants';
import { AdmissionsController } from './admissions.controller';
import { AdmissionsService } from './admissions.service';
import { AdmissionsListener } from './listeners/admissions.listener';
import { AdmissionRepositoryProvider } from './repositories/admissions.repository';
import { PrismaAdmissionRepository } from './repositories/prisma/prisma-admission.repository';
import { CreateAdmissionUseCase } from './use-cases/create-admission.usecase';
import { FindAdmissionByIdUseCase } from './use-cases/find-admission-by-id.usecase';
import { FindAllAdmissionsUseCase } from './use-cases/find-all-admissions.usecase';
import { UpdateAdmissionUseCase } from './use-cases/update-admission.usecase';
import { SoftDeleteAdmissionUseCase } from './use-cases/soft-delete-admission.usecase';

@Module({
  imports: [PrismaModule, AuthModule, InpatientModule],
  controllers: [AdmissionsController],
  providers: [
    AdmissionsService,
    AdmissionsListener,
    AdmissionRepositoryProvider,
    PrismaAdmissionRepository,
    CreateAdmissionUseCase,
    FindAdmissionByIdUseCase,
    FindAllAdmissionsUseCase,
    UpdateAdmissionUseCase,
    SoftDeleteAdmissionUseCase,
  ],
  exports: [AdmissionsService, ADMISSIONS_REPOSITORY],
})
export class AdmissionsModule {}
