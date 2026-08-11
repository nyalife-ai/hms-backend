/**
 * File: audit.module.ts
 * Module: audit
 * Purpose: Nest module wiring repository factory and use-cases.
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AUDIT_REPOSITORY } from './constants/audit.constants';
import { AuditController } from './audit.controller';
import { AuditLogsController } from './audit-logs.controller';
import { AuditService } from './audit.service';
import { AuditListener } from './listeners/audit.listener';
import { AuditRepositoryProvider } from './repositories/audit.repository';
import { PrismaAuditRepository } from './repositories/prisma/prisma-audit.repository';
import { CreateAuditUseCase } from './use-cases/create-audit.usecase';
import { FindAuditByIdUseCase } from './use-cases/find-audit-by-id.usecase';
import { FindAllAuditUseCase } from './use-cases/find-all-audit.usecase';
import { UpdateAuditUseCase } from './use-cases/update-audit.usecase';
import { SoftDeleteAuditUseCase } from './use-cases/soft-delete-audit.usecase';
import { HmsAuditWriter } from './hms-audit.writer';
import { HmsAuditQueryService } from './hms-audit-query.service';
import { AuditContextInterceptor } from './audit-context.interceptor';

@Module({
  imports: [PrismaModule],
  controllers: [AuditController, AuditLogsController],
  providers: [
    AuditService,
    AuditListener,
    AuditRepositoryProvider,
    PrismaAuditRepository,
    CreateAuditUseCase,
    FindAuditByIdUseCase,
    FindAllAuditUseCase,
    UpdateAuditUseCase,
    SoftDeleteAuditUseCase,
    HmsAuditWriter,
    HmsAuditQueryService,
    AuditContextInterceptor,
  ],
  exports: [AuditService, AUDIT_REPOSITORY, HmsAuditWriter, AuditContextInterceptor],
})
export class AuditModule {}
