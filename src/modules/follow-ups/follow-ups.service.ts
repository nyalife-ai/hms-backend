/**
 * File: follow-ups.service.ts
 * Module: follow-ups
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
import type { CreateFollowUpDto, FollowUpsQueryDto, UpdateFollowUpDto } from './dto';
import { FollowUpMapper } from './mappers/follow-up.mapper';
import { FOLLOW_UPS_EVENTS } from './constants/follow-ups.constants';
import { FollowUpCreatedEvent, FollowUpDeletedEvent, FollowUpUpdatedEvent } from './events';
import { CreateFollowUpUseCase } from './use-cases/create-follow-up.usecase';
import { FindFollowUpByIdUseCase } from './use-cases/find-follow-up-by-id.usecase';
import { FindAllFollowUpsUseCase } from './use-cases/find-all-follow-ups.usecase';
import { UpdateFollowUpUseCase } from './use-cases/update-follow-up.usecase';
import { SoftDeleteFollowUpUseCase } from './use-cases/soft-delete-follow-up.usecase';

@Injectable()
export class FollowUpsService {
  private readonly pagination = new PaginationService();

  public constructor(
    private readonly createUseCase: CreateFollowUpUseCase,
    private readonly findByIdUseCase: FindFollowUpByIdUseCase,
    private readonly findAllUseCase: FindAllFollowUpsUseCase,
    private readonly updateUseCase: UpdateFollowUpUseCase,
    private readonly softDeleteUseCase: SoftDeleteFollowUpUseCase,
    private readonly events: EventEmitter2,
  ) {}

  public async create(dto: CreateFollowUpDto) {
    const result = await this.createUseCase.execute(dto);
    const entity = this.unwrap(result);
    this.events.emit(FOLLOW_UPS_EVENTS.CREATED, new FollowUpCreatedEvent(entity.getId()));
    return FollowUpMapper.toResponse(entity);
  }

  public async findById(id: string) {
    const result = await this.findByIdUseCase.execute(id);
    return FollowUpMapper.toResponse(this.unwrap(result));
  }

  public async findAll(query: FollowUpsQueryDto) {
    const normalized = this.pagination.normalizeOffset({
      page: query.page,
      limit: query.limit,
    });
    const result = await this.findAllUseCase.execute({ ...query, ...normalized });
    const page = this.unwrap(result);
    const built = this.pagination.buildResult(FollowUpMapper.toResponseList(page.items), {
      total: page.total,
      page: normalized.page,
      limit: normalized.limit,
    });
    return built;
  }

  public async update(id: string, dto: UpdateFollowUpDto) {
    const result = await this.updateUseCase.execute(id, dto);
    const entity = this.unwrap(result);
    this.events.emit(FOLLOW_UPS_EVENTS.UPDATED, new FollowUpUpdatedEvent(entity.getId()));
    return FollowUpMapper.toResponse(entity);
  }

  public async softDelete(id: string): Promise<void> {
    const result = await this.softDeleteUseCase.execute(id);
    this.unwrap(result);
    this.events.emit(FOLLOW_UPS_EVENTS.DELETED, new FollowUpDeletedEvent(id));
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
