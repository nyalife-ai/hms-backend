/**
 * File: staff.service.ts
 * Module: staff
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
import type { CreateStaffDto, StaffQueryDto, UpdateStaffDto } from './dto';
import { StaffMapper } from './mappers/staff.mapper';
import { STAFF_EVENTS } from './constants/staff.constants';
import { StaffCreatedEvent, StaffDeletedEvent, StaffUpdatedEvent } from './events';
import { CreateStaffUseCase } from './use-cases/create-staff.usecase';
import { FindStaffByIdUseCase } from './use-cases/find-staff-by-id.usecase';
import { FindAllStaffUseCase } from './use-cases/find-all-staff.usecase';
import { UpdateStaffUseCase } from './use-cases/update-staff.usecase';
import { SoftDeleteStaffUseCase } from './use-cases/soft-delete-staff.usecase';

@Injectable()
export class StaffService {
  private readonly pagination = new PaginationService();

  public constructor(
    private readonly createUseCase: CreateStaffUseCase,
    private readonly findByIdUseCase: FindStaffByIdUseCase,
    private readonly findAllUseCase: FindAllStaffUseCase,
    private readonly updateUseCase: UpdateStaffUseCase,
    private readonly softDeleteUseCase: SoftDeleteStaffUseCase,
    private readonly events: EventEmitter2,
  ) {}

  public async create(dto: CreateStaffDto) {
    const result = await this.createUseCase.execute(dto);
    const entity = this.unwrap(result);
    this.events.emit(STAFF_EVENTS.CREATED, new StaffCreatedEvent(entity.getId()));
    return StaffMapper.toResponse(entity);
  }

  public async findById(id: string) {
    const result = await this.findByIdUseCase.execute(id);
    return StaffMapper.toResponse(this.unwrap(result));
  }

  public async findAll(query: StaffQueryDto) {
    const normalized = this.pagination.normalizeOffset({
      page: query.page,
      limit: query.limit,
    });
    const result = await this.findAllUseCase.execute({ ...query, ...normalized });
    const page = this.unwrap(result);
    const built = this.pagination.buildResult(StaffMapper.toResponseList(page.items), {
      total: page.total,
      page: normalized.page,
      limit: normalized.limit,
    });
    return built;
  }

  public async update(id: string, dto: UpdateStaffDto) {
    const result = await this.updateUseCase.execute(id, dto);
    const entity = this.unwrap(result);
    this.events.emit(STAFF_EVENTS.UPDATED, new StaffUpdatedEvent(entity.getId()));
    return StaffMapper.toResponse(entity);
  }

  public async softDelete(id: string): Promise<void> {
    const result = await this.softDeleteUseCase.execute(id);
    this.unwrap(result);
    this.events.emit(STAFF_EVENTS.DELETED, new StaffDeletedEvent(id));
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
