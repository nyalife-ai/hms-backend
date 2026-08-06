/**
 * File: documents.service.ts
 * Module: documents
 * Purpose: Application service orchestrating use-cases.
 */

import {
  ConflictException,
  Injectable,
  NotFoundException as HttpNotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Result } from '../../core/contracts';
import { BaseApplicationException, NotFoundException } from '../../core/exceptions';
import { PaginationService } from '../../platform/api/pagination/pagination.service';
import type { CreateDocumentDto, DocumentsQueryDto, UpdateDocumentDto } from './dto';
import { DocumentMapper } from './mappers/document.mapper';
import { DOCUMENTS_EVENTS } from './constants/documents.constants';
import { DocumentCreatedEvent, DocumentDeletedEvent, DocumentUpdatedEvent } from './events';
import { CreateDocumentUseCase } from './use-cases/create-document.usecase';
import { FindDocumentByIdUseCase } from './use-cases/find-document-by-id.usecase';
import { FindAllDocumentsUseCase } from './use-cases/find-all-documents.usecase';
import { UpdateDocumentUseCase } from './use-cases/update-document.usecase';
import { SoftDeleteDocumentUseCase } from './use-cases/soft-delete-document.usecase';

@Injectable()
export class DocumentsService {
  private readonly pagination = new PaginationService();

  public constructor(
    private readonly createUseCase: CreateDocumentUseCase,
    private readonly findByIdUseCase: FindDocumentByIdUseCase,
    private readonly findAllUseCase: FindAllDocumentsUseCase,
    private readonly updateUseCase: UpdateDocumentUseCase,
    private readonly softDeleteUseCase: SoftDeleteDocumentUseCase,
    private readonly events: EventEmitter2,
  ) {}

  public async create(dto: CreateDocumentDto) {
    const result = await this.createUseCase.execute(dto);
    const entity = this.unwrap(result);
    this.events.emit(DOCUMENTS_EVENTS.CREATED, new DocumentCreatedEvent(entity.getId()));
    return DocumentMapper.toResponse(entity);
  }

  public async findById(id: string) {
    const result = await this.findByIdUseCase.execute(id);
    return DocumentMapper.toResponse(this.unwrap(result));
  }

  public async findAll(query: DocumentsQueryDto) {
    const normalized = this.pagination.normalizeOffset({
      page: query.page,
      limit: query.limit,
    });
    const result = await this.findAllUseCase.execute({ ...query, ...normalized });
    const page = this.unwrap(result);
    const built = this.pagination.buildResult(DocumentMapper.toResponseList(page.items), {
      total: page.total,
      page: normalized.page,
      limit: normalized.limit,
    });
    return built;
  }

  public async update(id: string, dto: UpdateDocumentDto) {
    const result = await this.updateUseCase.execute(id, dto);
    const entity = this.unwrap(result);
    this.events.emit(DOCUMENTS_EVENTS.UPDATED, new DocumentUpdatedEvent(entity.getId()));
    return DocumentMapper.toResponse(entity);
  }

  public async softDelete(id: string): Promise<void> {
    const result = await this.softDeleteUseCase.execute(id);
    this.unwrap(result);
    this.events.emit(DOCUMENTS_EVENTS.DELETED, new DocumentDeletedEvent(id));
  }

  private unwrap<T, E>(result: Result<T, E>): T {
    if (result.isSuccess()) return result.getValue();
    const err = result.getError();
    if (err instanceof NotFoundException) {
      throw new HttpNotFoundException(err.message);
    }
    if (err instanceof BaseApplicationException) {
      throw new UnprocessableEntityException(err.message);
    }
    throw new ConflictException(String(err));
  }
}
