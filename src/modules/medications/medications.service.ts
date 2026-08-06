/**
 * File: medications.service.ts
 * Module: medications
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
import type { CreateMedicationDto, MedicationsQueryDto, UpdateMedicationDto } from './dto';
import { MedicationMapper } from './mappers/medication.mapper';
import { MEDICATIONS_EVENTS } from './constants/medications.constants';
import { MedicationCreatedEvent, MedicationDeletedEvent, MedicationUpdatedEvent } from './events';
import { CreateMedicationUseCase } from './use-cases/create-medication.usecase';
import { FindMedicationByIdUseCase } from './use-cases/find-medication-by-id.usecase';
import { FindAllMedicationsUseCase } from './use-cases/find-all-medications.usecase';
import { UpdateMedicationUseCase } from './use-cases/update-medication.usecase';
import { SoftDeleteMedicationUseCase } from './use-cases/soft-delete-medication.usecase';

@Injectable()
export class MedicationsService {
  private readonly pagination = new PaginationService();

  public constructor(
    private readonly createUseCase: CreateMedicationUseCase,
    private readonly findByIdUseCase: FindMedicationByIdUseCase,
    private readonly findAllUseCase: FindAllMedicationsUseCase,
    private readonly updateUseCase: UpdateMedicationUseCase,
    private readonly softDeleteUseCase: SoftDeleteMedicationUseCase,
    private readonly events: EventEmitter2,
  ) {}

  public async create(dto: CreateMedicationDto) {
    const result = await this.createUseCase.execute(dto);
    const entity = this.unwrap(result);
    this.events.emit(MEDICATIONS_EVENTS.CREATED, new MedicationCreatedEvent(entity.getId()));
    return MedicationMapper.toResponse(entity);
  }

  public async findById(id: string) {
    const result = await this.findByIdUseCase.execute(id);
    return MedicationMapper.toResponse(this.unwrap(result));
  }

  public async findAll(query: MedicationsQueryDto) {
    const normalized = this.pagination.normalizeOffset({
      page: query.page,
      limit: query.limit,
    });
    const result = await this.findAllUseCase.execute({ ...query, ...normalized });
    const page = this.unwrap(result);
    const built = this.pagination.buildResult(MedicationMapper.toResponseList(page.items), {
      total: page.total,
      page: normalized.page,
      limit: normalized.limit,
    });
    return built;
  }

  public async update(id: string, dto: UpdateMedicationDto) {
    const result = await this.updateUseCase.execute(id, dto);
    const entity = this.unwrap(result);
    this.events.emit(MEDICATIONS_EVENTS.UPDATED, new MedicationUpdatedEvent(entity.getId()));
    return MedicationMapper.toResponse(entity);
  }

  public async softDelete(id: string): Promise<void> {
    const result = await this.softDeleteUseCase.execute(id);
    this.unwrap(result);
    this.events.emit(MEDICATIONS_EVENTS.DELETED, new MedicationDeletedEvent(id));
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
