/**
 * File: consultations.module.ts
 * Module: consultations
 * Purpose: Nest module wiring repository factory and use-cases.
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { CONSULTATIONS_REPOSITORY } from './constants/consultations.constants';
import { ConsultationsController } from './consultations.controller';
import { ConsultationsService } from './consultations.service';
import { ConsultationsListener } from './listeners/consultations.listener';
import { ConsultationRepositoryProvider } from './repositories/consultations.repository';
import { PrismaConsultationRepository } from './repositories/prisma/prisma-consultation.repository';
import { CreateConsultationUseCase } from './use-cases/create-consultation.usecase';
import { FindConsultationByIdUseCase } from './use-cases/find-consultation-by-id.usecase';
import { FindAllConsultationsUseCase } from './use-cases/find-all-consultations.usecase';
import { UpdateConsultationUseCase } from './use-cases/update-consultation.usecase';
import { SoftDeleteConsultationUseCase } from './use-cases/soft-delete-consultation.usecase';

@Module({
  imports: [PrismaModule],
  controllers: [ConsultationsController],
  providers: [
    ConsultationsService,
    ConsultationsListener,
    ConsultationRepositoryProvider,
    PrismaConsultationRepository,
    CreateConsultationUseCase,
    FindConsultationByIdUseCase,
    FindAllConsultationsUseCase,
    UpdateConsultationUseCase,
    SoftDeleteConsultationUseCase,
  ],
  exports: [ConsultationsService, CONSULTATIONS_REPOSITORY],
})
export class ConsultationsModule {}
