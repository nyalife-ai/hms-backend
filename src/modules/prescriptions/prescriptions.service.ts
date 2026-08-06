/**
 * File: prescriptions.service.ts
 * Module: prescriptions
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
import type { CreatePrescriptionDto, PrescriptionsQueryDto, UpdatePrescriptionDto } from './dto';
import { PrescriptionMapper } from './mappers/prescription.mapper';
import { PRESCRIPTIONS_EVENTS } from './constants/prescriptions.constants';
import { PrescriptionCreatedEvent, PrescriptionDeletedEvent, PrescriptionUpdatedEvent } from './events';
import { CreatePrescriptionUseCase } from './use-cases/create-prescription.usecase';
import { FindPrescriptionByIdUseCase } from './use-cases/find-prescription-by-id.usecase';
import { FindAllPrescriptionsUseCase } from './use-cases/find-all-prescriptions.usecase';
import { UpdatePrescriptionUseCase } from './use-cases/update-prescription.usecase';
import { SoftDeletePrescriptionUseCase } from './use-cases/soft-delete-prescription.usecase';

@Injectable()
export class PrescriptionsService {
  private readonly pagination = new PaginationService();

  public constructor(
    private readonly createUseCase: CreatePrescriptionUseCase,
    private readonly findByIdUseCase: FindPrescriptionByIdUseCase,
    private readonly findAllUseCase: FindAllPrescriptionsUseCase,
    private readonly updateUseCase: UpdatePrescriptionUseCase,
    private readonly softDeleteUseCase: SoftDeletePrescriptionUseCase,
    private readonly events: EventEmitter2,
  ) {}

  public async create(dto: CreatePrescriptionDto) {
    const result = await this.createUseCase.execute(dto);
    const entity = this.unwrap(result);
    this.events.emit(PRESCRIPTIONS_EVENTS.CREATED, new PrescriptionCreatedEvent(entity.getId()));
    return PrescriptionMapper.toResponse(entity);
  }

  public async findById(id: string) {
    const result = await this.findByIdUseCase.execute(id);
    return PrescriptionMapper.toResponse(this.unwrap(result));
  }

  public async findAll(query: PrescriptionsQueryDto) {
    const normalized = this.pagination.normalizeOffset({
      page: query.page,
      limit: query.limit,
    });
    const result = await this.findAllUseCase.execute({ ...query, ...normalized });
    const page = this.unwrap(result);
    const built = this.pagination.buildResult(PrescriptionMapper.toResponseList(page.items), {
      total: page.total,
      page: normalized.page,
      limit: normalized.limit,
    });
    return built;
  }

  public async update(id: string, dto: UpdatePrescriptionDto) {
    const result = await this.updateUseCase.execute(id, dto);
    const entity = this.unwrap(result);
    this.events.emit(PRESCRIPTIONS_EVENTS.UPDATED, new PrescriptionUpdatedEvent(entity.getId()));
    return PrescriptionMapper.toResponse(entity);
  }

  public async softDelete(id: string): Promise<void> {
    const result = await this.softDeleteUseCase.execute(id);
    this.unwrap(result);
    this.events.emit(PRESCRIPTIONS_EVENTS.DELETED, new PrescriptionDeletedEvent(id));
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
