/**
 * File: radiology.service.ts
 * Module: radiology
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
import type { CreateRadiologyDto, RadiologyQueryDto, UpdateRadiologyDto } from './dto';
import { RadiologyMapper } from './mappers/radiology.mapper';
import { RADIOLOGY_EVENTS } from './constants/radiology.constants';
import { RadiologyCreatedEvent, RadiologyDeletedEvent, RadiologyUpdatedEvent } from './events';
import { CreateRadiologyUseCase } from './use-cases/create-radiology.usecase';
import { FindRadiologyByIdUseCase } from './use-cases/find-radiology-by-id.usecase';
import { FindAllRadiologyUseCase } from './use-cases/find-all-radiology.usecase';
import { UpdateRadiologyUseCase } from './use-cases/update-radiology.usecase';
import { SoftDeleteRadiologyUseCase } from './use-cases/soft-delete-radiology.usecase';

@Injectable()
export class RadiologyService {
  private readonly pagination = new PaginationService();

  public constructor(
    private readonly createUseCase: CreateRadiologyUseCase,
    private readonly findByIdUseCase: FindRadiologyByIdUseCase,
    private readonly findAllUseCase: FindAllRadiologyUseCase,
    private readonly updateUseCase: UpdateRadiologyUseCase,
    private readonly softDeleteUseCase: SoftDeleteRadiologyUseCase,
    private readonly events: EventEmitter2,
  ) {}

  public async create(dto: CreateRadiologyDto) {
    const result = await this.createUseCase.execute(dto);
    const entity = this.unwrap(result);
    this.events.emit(RADIOLOGY_EVENTS.CREATED, new RadiologyCreatedEvent(entity.getId()));
    return RadiologyMapper.toResponse(entity);
  }

  public async findById(id: string) {
    const result = await this.findByIdUseCase.execute(id);
    return RadiologyMapper.toResponse(this.unwrap(result));
  }

  public async findAll(query: RadiologyQueryDto) {
    const normalized = this.pagination.normalizeOffset({
      page: query.page,
      limit: query.limit,
    });
    const result = await this.findAllUseCase.execute({ ...query, ...normalized });
    const page = this.unwrap(result);
    const built = this.pagination.buildResult(RadiologyMapper.toResponseList(page.items), {
      total: page.total,
      page: normalized.page,
      limit: normalized.limit,
    });
    return built;
  }

  public async update(id: string, dto: UpdateRadiologyDto) {
    const result = await this.updateUseCase.execute(id, dto);
    const entity = this.unwrap(result);
    this.events.emit(RADIOLOGY_EVENTS.UPDATED, new RadiologyUpdatedEvent(entity.getId()));
    return RadiologyMapper.toResponse(entity);
  }

  public async softDelete(id: string): Promise<void> {
    const result = await this.softDeleteUseCase.execute(id);
    this.unwrap(result);
    this.events.emit(RADIOLOGY_EVENTS.DELETED, new RadiologyDeletedEvent(id));
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
