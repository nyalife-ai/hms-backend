/**
 * File: procedures.service.ts
 * Module: procedures
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
import type { CreateProcedureDto, ProceduresQueryDto, UpdateProcedureDto } from './dto';
import { ProcedureMapper } from './mappers/procedure.mapper';
import { PROCEDURES_EVENTS } from './constants/procedures.constants';
import { ProcedureCreatedEvent, ProcedureDeletedEvent, ProcedureUpdatedEvent } from './events';
import { CreateProcedureUseCase } from './use-cases/create-procedure.usecase';
import { FindProcedureByIdUseCase } from './use-cases/find-procedure-by-id.usecase';
import { FindAllProceduresUseCase } from './use-cases/find-all-procedures.usecase';
import { UpdateProcedureUseCase } from './use-cases/update-procedure.usecase';
import { SoftDeleteProcedureUseCase } from './use-cases/soft-delete-procedure.usecase';

@Injectable()
export class ProceduresService {
  private readonly pagination = new PaginationService();

  public constructor(
    private readonly createUseCase: CreateProcedureUseCase,
    private readonly findByIdUseCase: FindProcedureByIdUseCase,
    private readonly findAllUseCase: FindAllProceduresUseCase,
    private readonly updateUseCase: UpdateProcedureUseCase,
    private readonly softDeleteUseCase: SoftDeleteProcedureUseCase,
    private readonly events: EventEmitter2,
  ) {}

  public async create(dto: CreateProcedureDto) {
    const result = await this.createUseCase.execute(dto);
    const entity = this.unwrap(result);
    this.events.emit(PROCEDURES_EVENTS.CREATED, new ProcedureCreatedEvent(entity.getId()));
    return ProcedureMapper.toResponse(entity);
  }

  public async findById(id: string) {
    const result = await this.findByIdUseCase.execute(id);
    return ProcedureMapper.toResponse(this.unwrap(result));
  }

  public async findAll(query: ProceduresQueryDto) {
    const normalized = this.pagination.normalizeOffset({
      page: query.page,
      limit: query.limit,
    });
    const result = await this.findAllUseCase.execute({ ...query, ...normalized });
    const page = this.unwrap(result);
    const built = this.pagination.buildResult(ProcedureMapper.toResponseList(page.items), {
      total: page.total,
      page: normalized.page,
      limit: normalized.limit,
    });
    return built;
  }

  public async update(id: string, dto: UpdateProcedureDto) {
    const result = await this.updateUseCase.execute(id, dto);
    const entity = this.unwrap(result);
    this.events.emit(PROCEDURES_EVENTS.UPDATED, new ProcedureUpdatedEvent(entity.getId()));
    return ProcedureMapper.toResponse(entity);
  }

  public async softDelete(id: string): Promise<void> {
    const result = await this.softDeleteUseCase.execute(id);
    this.unwrap(result);
    this.events.emit(PROCEDURES_EVENTS.DELETED, new ProcedureDeletedEvent(id));
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
