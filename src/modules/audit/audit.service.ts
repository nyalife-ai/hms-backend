/**
 * File: audit.service.ts
 * Module: audit
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
import type { CreateAuditDto, AuditQueryDto, UpdateAuditDto } from './dto';
import { AuditMapper } from './mappers/audit.mapper';
import { AUDIT_EVENTS } from './constants/audit.constants';
import { AuditCreatedEvent, AuditDeletedEvent, AuditUpdatedEvent } from './events';
import { CreateAuditUseCase } from './use-cases/create-audit.usecase';
import { FindAuditByIdUseCase } from './use-cases/find-audit-by-id.usecase';
import { FindAllAuditUseCase } from './use-cases/find-all-audit.usecase';
import { UpdateAuditUseCase } from './use-cases/update-audit.usecase';
import { SoftDeleteAuditUseCase } from './use-cases/soft-delete-audit.usecase';

@Injectable()
export class AuditService {
  private readonly pagination = new PaginationService();

  public constructor(
    private readonly createUseCase: CreateAuditUseCase,
    private readonly findByIdUseCase: FindAuditByIdUseCase,
    private readonly findAllUseCase: FindAllAuditUseCase,
    private readonly updateUseCase: UpdateAuditUseCase,
    private readonly softDeleteUseCase: SoftDeleteAuditUseCase,
    private readonly events: EventEmitter2,
  ) {}

  public async create(dto: CreateAuditDto) {
    const result = await this.createUseCase.execute(dto);
    const entity = this.unwrap(result);
    this.events.emit(AUDIT_EVENTS.CREATED, new AuditCreatedEvent(entity.getId()));
    return AuditMapper.toResponse(entity);
  }

  public async findById(id: string) {
    const result = await this.findByIdUseCase.execute(id);
    return AuditMapper.toResponse(this.unwrap(result));
  }

  public async findAll(query: AuditQueryDto) {
    const normalized = this.pagination.normalizeOffset({
      page: query.page,
      limit: query.limit,
    });
    const result = await this.findAllUseCase.execute({ ...query, ...normalized });
    const page = this.unwrap(result);
    const built = this.pagination.buildResult(AuditMapper.toResponseList(page.items), {
      total: page.total,
      page: normalized.page,
      limit: normalized.limit,
    });
    return built;
  }

  public async update(id: string, dto: UpdateAuditDto) {
    const result = await this.updateUseCase.execute(id, dto);
    const entity = this.unwrap(result);
    this.events.emit(AUDIT_EVENTS.UPDATED, new AuditUpdatedEvent(entity.getId()));
    return AuditMapper.toResponse(entity);
  }

  public async softDelete(id: string): Promise<void> {
    const result = await this.softDeleteUseCase.execute(id);
    this.unwrap(result);
    this.events.emit(AUDIT_EVENTS.DELETED, new AuditDeletedEvent(id));
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
