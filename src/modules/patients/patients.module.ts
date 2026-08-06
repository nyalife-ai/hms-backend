/**
 * File: patients.module.ts
 * Prisma-first wiring (ORM_PROVIDER=prisma). TypeORM adapters remain in tree for dual-ORM.
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { PATIENTS_REPOSITORY } from './constants/patients.constants';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';
import { PatientsListener } from './listeners/patients.listener';
import { PatientRepositoryProvider } from './repositories/patients.repository';
import { PrismaPatientRepository } from './repositories/prisma/prisma-patient.repository';
import { CreatePatientUseCase } from './use-cases/create-patient.usecase';
import { FindPatientByIdUseCase } from './use-cases/find-patient-by-id.usecase';
import { FindAllPatientsUseCase } from './use-cases/find-all-patients.usecase';
import { UpdatePatientUseCase } from './use-cases/update-patient.usecase';
import { SoftDeletePatientUseCase } from './use-cases/soft-delete-patient.usecase';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule],
  controllers: [PatientsController],
  providers: [
    PatientsService,
    PatientsListener,
    PatientRepositoryProvider,
    PrismaPatientRepository,
    CreatePatientUseCase,
    FindPatientByIdUseCase,
    FindAllPatientsUseCase,
    UpdatePatientUseCase,
    SoftDeletePatientUseCase,
  ],
  exports: [PatientsService, PATIENTS_REPOSITORY],
})
export class PatientsModule {}
