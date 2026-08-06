/**
 * File: wards.service.ts
 * Module: wards
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
import type { CreateWardDto, WardsQueryDto, UpdateWardDto } from './dto';
import { WardMapper } from './mappers/ward.mapper';
import { WARDS_EVENTS } from './constants/wards.constants';
import { WardCreatedEvent, WardDeletedEvent, WardUpdatedEvent } from './events';
import { CreateWardUseCase } from './use-cases/create-ward.usecase';
import { FindWardByIdUseCase } from './use-cases/find-ward-by-id.usecase';
import { FindAllWardsUseCase } from './use-cases/find-all-wards.usecase';
import { UpdateWardUseCase } from './use-cases/update-ward.usecase';
import { SoftDeleteWardUseCase } from './use-cases/soft-delete-ward.usecase';

@Injectable()
export class WardsService {
  private readonly pagination = new PaginationService();

  public constructor(
    private readonly createUseCase: CreateWardUseCase,
    private readonly findByIdUseCase: FindWardByIdUseCase,
    private readonly findAllUseCase: FindAllWardsUseCase,
    private readonly updateUseCase: UpdateWardUseCase,
    private readonly softDeleteUseCase: SoftDeleteWardUseCase,
    private readonly events: EventEmitter2,
  ) {}

  public async create(dto: CreateWardDto) {
    const result = await this.createUseCase.execute(dto);
    const entity = this.unwrap(result);
    this.events.emit(WARDS_EVENTS.CREATED, new WardCreatedEvent(entity.getId()));
    return WardMapper.toResponse(entity);
  }

  public async findById(id: string) {
    const result = await this.findByIdUseCase.execute(id);
    return WardMapper.toResponse(this.unwrap(result));
  }

  public async findAll(query: WardsQueryDto) {
    const normalized = this.pagination.normalizeOffset({
      page: query.page,
      limit: query.limit,
    });
    const result = await this.findAllUseCase.execute({ ...query, ...normalized });
    const page = this.unwrap(result);
    const built = this.pagination.buildResult(WardMapper.toResponseList(page.items), {
      total: page.total,
      page: normalized.page,
      limit: normalized.limit,
    });
    return built;
  }

  public async update(id: string, dto: UpdateWardDto) {
    const result = await this.updateUseCase.execute(id, dto);
    const entity = this.unwrap(result);
    this.events.emit(WARDS_EVENTS.UPDATED, new WardUpdatedEvent(entity.getId()));
    return WardMapper.toResponse(entity);
  }

  public async softDelete(id: string): Promise<void> {
    const result = await this.softDeleteUseCase.execute(id);
    this.unwrap(result);
    this.events.emit(WARDS_EVENTS.DELETED, new WardDeletedEvent(id));
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
