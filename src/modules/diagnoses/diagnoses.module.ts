/**
 * File: diagnoses.module.ts
 * Module: diagnoses
 * Purpose: Nest module wiring repository factory and use-cases.
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { DIAGNOSES_REPOSITORY } from './constants/diagnoses.constants';
import { DiagnosesController } from './diagnoses.controller';
import { DiagnosesService } from './diagnoses.service';
import { DiagnosesListener } from './listeners/diagnoses.listener';
import { DiagnosRepositoryProvider } from './repositories/diagnoses.repository';
import { PrismaDiagnosRepository } from './repositories/prisma/prisma-diagnos.repository';
import { CreateDiagnosUseCase } from './use-cases/create-diagnos.usecase';
import { FindDiagnosByIdUseCase } from './use-cases/find-diagnos-by-id.usecase';
import { FindAllDiagnosesUseCase } from './use-cases/find-all-diagnoses.usecase';
import { UpdateDiagnosUseCase } from './use-cases/update-diagnos.usecase';
import { SoftDeleteDiagnosUseCase } from './use-cases/soft-delete-diagnos.usecase';

@Module({
  imports: [PrismaModule],
  controllers: [DiagnosesController],
  providers: [
    DiagnosesService,
    DiagnosesListener,
    DiagnosRepositoryProvider,
    PrismaDiagnosRepository,
    CreateDiagnosUseCase,
    FindDiagnosByIdUseCase,
    FindAllDiagnosesUseCase,
    UpdateDiagnosUseCase,
    SoftDeleteDiagnosUseCase,
  ],
  exports: [DiagnosesService, DIAGNOSES_REPOSITORY],
})
export class DiagnosesModule {}
