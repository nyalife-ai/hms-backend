/**
 * File: admissions.service.ts
 * Module: admissions
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
import type { CreateAdmissionDto, AdmissionsQueryDto, UpdateAdmissionDto } from './dto';
import { AdmissionMapper } from './mappers/admission.mapper';
import { ADMISSIONS_EVENTS } from './constants/admissions.constants';
import { AdmissionCreatedEvent, AdmissionDeletedEvent, AdmissionUpdatedEvent } from './events';
import { CreateAdmissionUseCase } from './use-cases/create-admission.usecase';
import { FindAdmissionByIdUseCase } from './use-cases/find-admission-by-id.usecase';
import { FindAllAdmissionsUseCase } from './use-cases/find-all-admissions.usecase';
import { UpdateAdmissionUseCase } from './use-cases/update-admission.usecase';
import { SoftDeleteAdmissionUseCase } from './use-cases/soft-delete-admission.usecase';

@Injectable()
export class AdmissionsService {
  private readonly pagination = new PaginationService();

  public constructor(
    private readonly createUseCase: CreateAdmissionUseCase,
    private readonly findByIdUseCase: FindAdmissionByIdUseCase,
    private readonly findAllUseCase: FindAllAdmissionsUseCase,
    private readonly updateUseCase: UpdateAdmissionUseCase,
    private readonly softDeleteUseCase: SoftDeleteAdmissionUseCase,
    private readonly events: EventEmitter2,
  ) {}

  public async create(dto: CreateAdmissionDto) {
    const result = await this.createUseCase.execute(dto);
    const entity = this.unwrap(result);
    this.events.emit(ADMISSIONS_EVENTS.CREATED, new AdmissionCreatedEvent(entity.getId()));
    return AdmissionMapper.toResponse(entity);
  }

  public async findById(id: string) {
    const result = await this.findByIdUseCase.execute(id);
    return AdmissionMapper.toResponse(this.unwrap(result));
  }

  public async findAll(query: AdmissionsQueryDto) {
    const normalized = this.pagination.normalizeOffset({
      page: query.page,
      limit: query.limit,
    });
    const result = await this.findAllUseCase.execute({ ...query, ...normalized });
    const page = this.unwrap(result);
    const built = this.pagination.buildResult(AdmissionMapper.toResponseList(page.items), {
      total: page.total,
      page: normalized.page,
      limit: normalized.limit,
    });
    return built;
  }

  public async update(id: string, dto: UpdateAdmissionDto) {
    const result = await this.updateUseCase.execute(id, dto);
    const entity = this.unwrap(result);
    this.events.emit(ADMISSIONS_EVENTS.UPDATED, new AdmissionUpdatedEvent(entity.getId()));
    return AdmissionMapper.toResponse(entity);
  }

  public async softDelete(id: string): Promise<void> {
    const result = await this.softDeleteUseCase.execute(id);
    this.unwrap(result);
    this.events.emit(ADMISSIONS_EVENTS.DELETED, new AdmissionDeletedEvent(id));
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
