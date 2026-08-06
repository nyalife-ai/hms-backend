/**
 * File: laboratory.service.ts
 * Module: laboratory
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
import type { CreateLaboratoryDto, LaboratoryQueryDto, UpdateLaboratoryDto } from './dto';
import { LaboratoryMapper } from './mappers/laboratory.mapper';
import { LABORATORY_EVENTS } from './constants/laboratory.constants';
import { LaboratoryCreatedEvent, LaboratoryDeletedEvent, LaboratoryUpdatedEvent } from './events';
import { CreateLaboratoryUseCase } from './use-cases/create-laboratory.usecase';
import { FindLaboratoryByIdUseCase } from './use-cases/find-laboratory-by-id.usecase';
import { FindAllLaboratoryUseCase } from './use-cases/find-all-laboratory.usecase';
import { UpdateLaboratoryUseCase } from './use-cases/update-laboratory.usecase';
import { SoftDeleteLaboratoryUseCase } from './use-cases/soft-delete-laboratory.usecase';

@Injectable()
export class LaboratoryService {
  private readonly pagination = new PaginationService();

  public constructor(
    private readonly createUseCase: CreateLaboratoryUseCase,
    private readonly findByIdUseCase: FindLaboratoryByIdUseCase,
    private readonly findAllUseCase: FindAllLaboratoryUseCase,
    private readonly updateUseCase: UpdateLaboratoryUseCase,
    private readonly softDeleteUseCase: SoftDeleteLaboratoryUseCase,
    private readonly events: EventEmitter2,
  ) {}

  public async create(dto: CreateLaboratoryDto) {
    const result = await this.createUseCase.execute(dto);
    const entity = this.unwrap(result);
    this.events.emit(LABORATORY_EVENTS.CREATED, new LaboratoryCreatedEvent(entity.getId()));
    return LaboratoryMapper.toResponse(entity);
  }

  public async findById(id: string) {
    const result = await this.findByIdUseCase.execute(id);
    return LaboratoryMapper.toResponse(this.unwrap(result));
  }

  public async findAll(query: LaboratoryQueryDto) {
    const normalized = this.pagination.normalizeOffset({
      page: query.page,
      limit: query.limit,
    });
    const result = await this.findAllUseCase.execute({ ...query, ...normalized });
    const page = this.unwrap(result);
    const built = this.pagination.buildResult(LaboratoryMapper.toResponseList(page.items), {
      total: page.total,
      page: normalized.page,
      limit: normalized.limit,
    });
    return built;
  }

  public async update(id: string, dto: UpdateLaboratoryDto) {
    const result = await this.updateUseCase.execute(id, dto);
    const entity = this.unwrap(result);
    this.events.emit(LABORATORY_EVENTS.UPDATED, new LaboratoryUpdatedEvent(entity.getId()));
    return LaboratoryMapper.toResponse(entity);
  }

  public async softDelete(id: string): Promise<void> {
    const result = await this.softDeleteUseCase.execute(id);
    this.unwrap(result);
    this.events.emit(LABORATORY_EVENTS.DELETED, new LaboratoryDeletedEvent(id));
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
