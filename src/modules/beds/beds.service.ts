/**
 * File: beds.service.ts
 * Module: beds
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
import type { CreateBedDto, BedsQueryDto, UpdateBedDto } from './dto';
import { BedMapper } from './mappers/bed.mapper';
import { BEDS_EVENTS } from './constants/beds.constants';
import { BedCreatedEvent, BedDeletedEvent, BedUpdatedEvent } from './events';
import { CreateBedUseCase } from './use-cases/create-bed.usecase';
import { FindBedByIdUseCase } from './use-cases/find-bed-by-id.usecase';
import { FindAllBedsUseCase } from './use-cases/find-all-beds.usecase';
import { UpdateBedUseCase } from './use-cases/update-bed.usecase';
import { SoftDeleteBedUseCase } from './use-cases/soft-delete-bed.usecase';

@Injectable()
export class BedsService {
  private readonly pagination = new PaginationService();

  public constructor(
    private readonly createUseCase: CreateBedUseCase,
    private readonly findByIdUseCase: FindBedByIdUseCase,
    private readonly findAllUseCase: FindAllBedsUseCase,
    private readonly updateUseCase: UpdateBedUseCase,
    private readonly softDeleteUseCase: SoftDeleteBedUseCase,
    private readonly events: EventEmitter2,
  ) {}

  public async create(dto: CreateBedDto) {
    const result = await this.createUseCase.execute(dto);
    const entity = this.unwrap(result);
    this.events.emit(BEDS_EVENTS.CREATED, new BedCreatedEvent(entity.getId()));
    return BedMapper.toResponse(entity);
  }

  public async findById(id: string) {
    const result = await this.findByIdUseCase.execute(id);
    return BedMapper.toResponse(this.unwrap(result));
  }

  public async findAll(query: BedsQueryDto) {
    const normalized = this.pagination.normalizeOffset({
      page: query.page,
      limit: query.limit,
    });
    const result = await this.findAllUseCase.execute({ ...query, ...normalized });
    const page = this.unwrap(result);
    const built = this.pagination.buildResult(BedMapper.toResponseList(page.items), {
      total: page.total,
      page: normalized.page,
      limit: normalized.limit,
    });
    return built;
  }

  public async update(id: string, dto: UpdateBedDto) {
    const result = await this.updateUseCase.execute(id, dto);
    const entity = this.unwrap(result);
    this.events.emit(BEDS_EVENTS.UPDATED, new BedUpdatedEvent(entity.getId()));
    return BedMapper.toResponse(entity);
  }

  public async softDelete(id: string): Promise<void> {
    const result = await this.softDeleteUseCase.execute(id);
    this.unwrap(result);
    this.events.emit(BEDS_EVENTS.DELETED, new BedDeletedEvent(id));
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
