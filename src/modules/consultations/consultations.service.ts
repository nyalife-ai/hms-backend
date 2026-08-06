/**
 * File: consultations.service.ts
 * Module: consultations
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
import type { CreateConsultationDto, ConsultationsQueryDto, UpdateConsultationDto } from './dto';
import { ConsultationMapper } from './mappers/consultation.mapper';
import { CONSULTATIONS_EVENTS } from './constants/consultations.constants';
import { ConsultationCreatedEvent, ConsultationDeletedEvent, ConsultationUpdatedEvent } from './events';
import { CreateConsultationUseCase } from './use-cases/create-consultation.usecase';
import { FindConsultationByIdUseCase } from './use-cases/find-consultation-by-id.usecase';
import { FindAllConsultationsUseCase } from './use-cases/find-all-consultations.usecase';
import { UpdateConsultationUseCase } from './use-cases/update-consultation.usecase';
import { SoftDeleteConsultationUseCase } from './use-cases/soft-delete-consultation.usecase';

@Injectable()
export class ConsultationsService {
  private readonly pagination = new PaginationService();

  public constructor(
    private readonly createUseCase: CreateConsultationUseCase,
    private readonly findByIdUseCase: FindConsultationByIdUseCase,
    private readonly findAllUseCase: FindAllConsultationsUseCase,
    private readonly updateUseCase: UpdateConsultationUseCase,
    private readonly softDeleteUseCase: SoftDeleteConsultationUseCase,
    private readonly events: EventEmitter2,
  ) {}

  public async create(dto: CreateConsultationDto) {
    const result = await this.createUseCase.execute(dto);
    const entity = this.unwrap(result);
    this.events.emit(CONSULTATIONS_EVENTS.CREATED, new ConsultationCreatedEvent(entity.getId()));
    return ConsultationMapper.toResponse(entity);
  }

  public async findById(id: string) {
    const result = await this.findByIdUseCase.execute(id);
    return ConsultationMapper.toResponse(this.unwrap(result));
  }

  public async findAll(query: ConsultationsQueryDto) {
    const normalized = this.pagination.normalizeOffset({
      page: query.page,
      limit: query.limit,
    });
    const result = await this.findAllUseCase.execute({ ...query, ...normalized });
    const page = this.unwrap(result);
    const built = this.pagination.buildResult(ConsultationMapper.toResponseList(page.items), {
      total: page.total,
      page: normalized.page,
      limit: normalized.limit,
    });
    return built;
  }

  public async update(id: string, dto: UpdateConsultationDto) {
    const result = await this.updateUseCase.execute(id, dto);
    const entity = this.unwrap(result);
    this.events.emit(CONSULTATIONS_EVENTS.UPDATED, new ConsultationUpdatedEvent(entity.getId()));
    return ConsultationMapper.toResponse(entity);
  }

  public async softDelete(id: string): Promise<void> {
    const result = await this.softDeleteUseCase.execute(id);
    this.unwrap(result);
    this.events.emit(CONSULTATIONS_EVENTS.DELETED, new ConsultationDeletedEvent(id));
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
