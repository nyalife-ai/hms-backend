/**
 * File: departments.service.ts
 * Module: departments
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
import type { CreateDepartmentDto, DepartmentsQueryDto, UpdateDepartmentDto } from './dto';
import { DepartmentMapper } from './mappers/department.mapper';
import { DEPARTMENTS_EVENTS } from './constants/departments.constants';
import { DepartmentCreatedEvent, DepartmentDeletedEvent, DepartmentUpdatedEvent } from './events';
import { CreateDepartmentUseCase } from './use-cases/create-department.usecase';
import { FindDepartmentByIdUseCase } from './use-cases/find-department-by-id.usecase';
import { FindAllDepartmentsUseCase } from './use-cases/find-all-departments.usecase';
import { UpdateDepartmentUseCase } from './use-cases/update-department.usecase';
import { SoftDeleteDepartmentUseCase } from './use-cases/soft-delete-department.usecase';

@Injectable()
export class DepartmentsService {
  private readonly pagination = new PaginationService();

  public constructor(
    private readonly createUseCase: CreateDepartmentUseCase,
    private readonly findByIdUseCase: FindDepartmentByIdUseCase,
    private readonly findAllUseCase: FindAllDepartmentsUseCase,
    private readonly updateUseCase: UpdateDepartmentUseCase,
    private readonly softDeleteUseCase: SoftDeleteDepartmentUseCase,
    private readonly events: EventEmitter2,
  ) {}

  public async create(dto: CreateDepartmentDto) {
    const result = await this.createUseCase.execute(dto);
    const entity = this.unwrap(result);
    this.events.emit(DEPARTMENTS_EVENTS.CREATED, new DepartmentCreatedEvent(entity.getId()));
    return DepartmentMapper.toResponse(entity);
  }

  public async findById(id: string) {
    const result = await this.findByIdUseCase.execute(id);
    return DepartmentMapper.toResponse(this.unwrap(result));
  }

  public async findAll(query: DepartmentsQueryDto) {
    const normalized = this.pagination.normalizeOffset({
      page: query.page,
      limit: query.limit,
    });
    const result = await this.findAllUseCase.execute({ ...query, ...normalized });
    const page = this.unwrap(result);
    const built = this.pagination.buildResult(DepartmentMapper.toResponseList(page.items), {
      total: page.total,
      page: normalized.page,
      limit: normalized.limit,
    });
    return built;
  }

  public async update(id: string, dto: UpdateDepartmentDto) {
    const result = await this.updateUseCase.execute(id, dto);
    const entity = this.unwrap(result);
    this.events.emit(DEPARTMENTS_EVENTS.UPDATED, new DepartmentUpdatedEvent(entity.getId()));
    return DepartmentMapper.toResponse(entity);
  }

  public async softDelete(id: string): Promise<void> {
    const result = await this.softDeleteUseCase.execute(id);
    this.unwrap(result);
    this.events.emit(DEPARTMENTS_EVENTS.DELETED, new DepartmentDeletedEvent(id));
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
