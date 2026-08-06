/**
 * File: diagnoses.service.ts
 * Module: diagnoses
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
import type { CreateDiagnosDto, DiagnosesQueryDto, UpdateDiagnosDto } from './dto';
import { DiagnosMapper } from './mappers/diagnos.mapper';
import { DIAGNOSES_EVENTS } from './constants/diagnoses.constants';
import { DiagnosCreatedEvent, DiagnosDeletedEvent, DiagnosUpdatedEvent } from './events';
import { CreateDiagnosUseCase } from './use-cases/create-diagnos.usecase';
import { FindDiagnosByIdUseCase } from './use-cases/find-diagnos-by-id.usecase';
import { FindAllDiagnosesUseCase } from './use-cases/find-all-diagnoses.usecase';
import { UpdateDiagnosUseCase } from './use-cases/update-diagnos.usecase';
import { SoftDeleteDiagnosUseCase } from './use-cases/soft-delete-diagnos.usecase';

@Injectable()
export class DiagnosesService {
  private readonly pagination = new PaginationService();

  public constructor(
    private readonly createUseCase: CreateDiagnosUseCase,
    private readonly findByIdUseCase: FindDiagnosByIdUseCase,
    private readonly findAllUseCase: FindAllDiagnosesUseCase,
    private readonly updateUseCase: UpdateDiagnosUseCase,
    private readonly softDeleteUseCase: SoftDeleteDiagnosUseCase,
    private readonly events: EventEmitter2,
  ) {}

  public async create(dto: CreateDiagnosDto) {
    const result = await this.createUseCase.execute(dto);
    const entity = this.unwrap(result);
    this.events.emit(DIAGNOSES_EVENTS.CREATED, new DiagnosCreatedEvent(entity.getId()));
    return DiagnosMapper.toResponse(entity);
  }

  public async findById(id: string) {
    const result = await this.findByIdUseCase.execute(id);
    return DiagnosMapper.toResponse(this.unwrap(result));
  }

  public async findAll(query: DiagnosesQueryDto) {
    const normalized = this.pagination.normalizeOffset({
      page: query.page,
      limit: query.limit,
    });
    const result = await this.findAllUseCase.execute({ ...query, ...normalized });
    const page = this.unwrap(result);
    const built = this.pagination.buildResult(DiagnosMapper.toResponseList(page.items), {
      total: page.total,
      page: normalized.page,
      limit: normalized.limit,
    });
    return built;
  }

  public async update(id: string, dto: UpdateDiagnosDto) {
    const result = await this.updateUseCase.execute(id, dto);
    const entity = this.unwrap(result);
    this.events.emit(DIAGNOSES_EVENTS.UPDATED, new DiagnosUpdatedEvent(entity.getId()));
    return DiagnosMapper.toResponse(entity);
  }

  public async softDelete(id: string): Promise<void> {
    const result = await this.softDeleteUseCase.execute(id);
    this.unwrap(result);
    this.events.emit(DIAGNOSES_EVENTS.DELETED, new DiagnosDeletedEvent(id));
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
