/**
 * File: procedures.module.ts
 * Module: procedures
 * Purpose: Nest module wiring repository factory and use-cases.
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { PROCEDURES_REPOSITORY } from './constants/procedures.constants';
import { ProceduresController } from './procedures.controller';
import { ProceduresService } from './procedures.service';
import { ProceduresListener } from './listeners/procedures.listener';
import { ProcedureRepositoryProvider } from './repositories/procedures.repository';
import { PrismaProcedureRepository } from './repositories/prisma/prisma-procedure.repository';
import { CreateProcedureUseCase } from './use-cases/create-procedure.usecase';
import { FindProcedureByIdUseCase } from './use-cases/find-procedure-by-id.usecase';
import { FindAllProceduresUseCase } from './use-cases/find-all-procedures.usecase';
import { UpdateProcedureUseCase } from './use-cases/update-procedure.usecase';
import { SoftDeleteProcedureUseCase } from './use-cases/soft-delete-procedure.usecase';

@Module({
  imports: [PrismaModule],
  controllers: [ProceduresController],
  providers: [
    ProceduresService,
    ProceduresListener,
    ProcedureRepositoryProvider,
    PrismaProcedureRepository,
    CreateProcedureUseCase,
    FindProcedureByIdUseCase,
    FindAllProceduresUseCase,
    UpdateProcedureUseCase,
    SoftDeleteProcedureUseCase,
  ],
  exports: [ProceduresService, PROCEDURES_REPOSITORY],
})
export class ProceduresModule {}
