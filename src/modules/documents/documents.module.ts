/**
 * File: documents.module.ts
 * Module: documents
 * Purpose: Nest module wiring repository factory and use-cases.
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { DOCUMENTS_REPOSITORY } from './constants/documents.constants';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentsListener } from './listeners/documents.listener';
import { DocumentRepositoryProvider } from './repositories/documents.repository';
import { PrismaDocumentRepository } from './repositories/prisma/prisma-document.repository';
import { CreateDocumentUseCase } from './use-cases/create-document.usecase';
import { FindDocumentByIdUseCase } from './use-cases/find-document-by-id.usecase';
import { FindAllDocumentsUseCase } from './use-cases/find-all-documents.usecase';
import { UpdateDocumentUseCase } from './use-cases/update-document.usecase';
import { SoftDeleteDocumentUseCase } from './use-cases/soft-delete-document.usecase';

@Module({
  imports: [PrismaModule],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    DocumentsListener,
    DocumentRepositoryProvider,
    PrismaDocumentRepository,
    CreateDocumentUseCase,
    FindDocumentByIdUseCase,
    FindAllDocumentsUseCase,
    UpdateDocumentUseCase,
    SoftDeleteDocumentUseCase,
  ],
  exports: [DocumentsService, DOCUMENTS_REPOSITORY],
})
export class DocumentsModule {}
