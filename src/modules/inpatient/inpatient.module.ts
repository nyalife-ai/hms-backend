/**
 * File: inpatient.module.ts
 * Module: inpatient
 * Purpose: IPD journey + scaffold wiring.
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { INPATIENT_REPOSITORY } from './constants/inpatient.constants';
import { InpatientController } from './inpatient.controller';
import { InpatientService } from './inpatient.service';
import { InpatientListener } from './listeners/inpatient.listener';
import { AdmissionRealtimeListener } from './listeners/ipd-realtime.listener';
import { InpatientRepositoryProvider } from './repositories/inpatient.repository';
import { PrismaInpatientRepository } from './repositories/prisma/prisma-inpatient.repository';
import { CreateInpatientUseCase } from './use-cases/create-inpatient.usecase';
import { FindInpatientByIdUseCase } from './use-cases/find-inpatient-by-id.usecase';
import { FindAllInpatientUseCase } from './use-cases/find-all-inpatient.usecase';
import { UpdateInpatientUseCase } from './use-cases/update-inpatient.usecase';
import { SoftDeleteInpatientUseCase } from './use-cases/soft-delete-inpatient.usecase';
import { IpdJourneyUseCase } from './use-cases/ipd-journey.usecase';
import { IpdOperationsUseCase } from './use-cases/ipd-operations.usecase';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule],
  controllers: [InpatientController],
  providers: [
    InpatientService,
    InpatientListener,
    AdmissionRealtimeListener,
    InpatientRepositoryProvider,
    PrismaInpatientRepository,
    CreateInpatientUseCase,
    FindInpatientByIdUseCase,
    FindAllInpatientUseCase,
    UpdateInpatientUseCase,
    SoftDeleteInpatientUseCase,
    IpdJourneyUseCase,
    IpdOperationsUseCase,
  ],
  exports: [
    InpatientService,
    IpdJourneyUseCase,
    IpdOperationsUseCase,
    INPATIENT_REPOSITORY,
  ],
})
export class InpatientModule {}
