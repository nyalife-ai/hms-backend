/**
 * File: inpatient.service.ts
 * Module: inpatient
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
import type { CreateInpatientDto, InpatientQueryDto, UpdateInpatientDto } from './dto';
import { InpatientMapper } from './mappers/inpatient.mapper';
import { INPATIENT_EVENTS } from './constants/inpatient.constants';
import { InpatientCreatedEvent, InpatientDeletedEvent, InpatientUpdatedEvent } from './events';
import { CreateInpatientUseCase } from './use-cases/create-inpatient.usecase';
import { FindInpatientByIdUseCase } from './use-cases/find-inpatient-by-id.usecase';
import { FindAllInpatientUseCase } from './use-cases/find-all-inpatient.usecase';
import { UpdateInpatientUseCase } from './use-cases/update-inpatient.usecase';
import { SoftDeleteInpatientUseCase } from './use-cases/soft-delete-inpatient.usecase';

@Injectable()
export class InpatientService {
  private readonly pagination = new PaginationService();

  public constructor(
    private readonly createUseCase: CreateInpatientUseCase,
    private readonly findByIdUseCase: FindInpatientByIdUseCase,
    private readonly findAllUseCase: FindAllInpatientUseCase,
    private readonly updateUseCase: UpdateInpatientUseCase,
    private readonly softDeleteUseCase: SoftDeleteInpatientUseCase,
    private readonly events: EventEmitter2,
  ) {}

  public async create(dto: CreateInpatientDto) {
    const result = await this.createUseCase.execute(dto);
    const entity = this.unwrap(result);
    this.events.emit(INPATIENT_EVENTS.CREATED, new InpatientCreatedEvent(entity.getId()));
    return InpatientMapper.toResponse(entity);
  }

  public async findById(id: string) {
    const result = await this.findByIdUseCase.execute(id);
    return InpatientMapper.toResponse(this.unwrap(result));
  }

  public async findAll(query: InpatientQueryDto) {
    const normalized = this.pagination.normalizeOffset({
      page: query.page,
      limit: query.limit,
    });
    const result = await this.findAllUseCase.execute({ ...query, ...normalized });
    const page = this.unwrap(result);
    const built = this.pagination.buildResult(InpatientMapper.toResponseList(page.items), {
      total: page.total,
      page: normalized.page,
      limit: normalized.limit,
    });
    return built;
  }

  public async update(id: string, dto: UpdateInpatientDto) {
    const result = await this.updateUseCase.execute(id, dto);
    const entity = this.unwrap(result);
    this.events.emit(INPATIENT_EVENTS.UPDATED, new InpatientUpdatedEvent(entity.getId()));
    return InpatientMapper.toResponse(entity);
  }

  public async softDelete(id: string): Promise<void> {
    const result = await this.softDeleteUseCase.execute(id);
    this.unwrap(result);
    this.events.emit(INPATIENT_EVENTS.DELETED, new InpatientDeletedEvent(id));
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
