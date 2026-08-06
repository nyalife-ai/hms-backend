/**
 * File: pharmacy.service.ts
 * Module: pharmacy
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
import type { CreatePharmacyDto, PharmacyQueryDto, UpdatePharmacyDto } from './dto';
import { PharmacyMapper } from './mappers/pharmacy.mapper';
import { PHARMACY_EVENTS } from './constants/pharmacy.constants';
import { PharmacyCreatedEvent, PharmacyDeletedEvent, PharmacyUpdatedEvent } from './events';
import { CreatePharmacyUseCase } from './use-cases/create-pharmacy.usecase';
import { FindPharmacyByIdUseCase } from './use-cases/find-pharmacy-by-id.usecase';
import { FindAllPharmacyUseCase } from './use-cases/find-all-pharmacy.usecase';
import { UpdatePharmacyUseCase } from './use-cases/update-pharmacy.usecase';
import { SoftDeletePharmacyUseCase } from './use-cases/soft-delete-pharmacy.usecase';

@Injectable()
export class PharmacyService {
  private readonly pagination = new PaginationService();

  public constructor(
    private readonly createUseCase: CreatePharmacyUseCase,
    private readonly findByIdUseCase: FindPharmacyByIdUseCase,
    private readonly findAllUseCase: FindAllPharmacyUseCase,
    private readonly updateUseCase: UpdatePharmacyUseCase,
    private readonly softDeleteUseCase: SoftDeletePharmacyUseCase,
    private readonly events: EventEmitter2,
  ) {}

  public async create(dto: CreatePharmacyDto) {
    const result = await this.createUseCase.execute(dto);
    const entity = this.unwrap(result);
    this.events.emit(PHARMACY_EVENTS.CREATED, new PharmacyCreatedEvent(entity.getId()));
    return PharmacyMapper.toResponse(entity);
  }

  public async findById(id: string) {
    const result = await this.findByIdUseCase.execute(id);
    return PharmacyMapper.toResponse(this.unwrap(result));
  }

  public async findAll(query: PharmacyQueryDto) {
    const normalized = this.pagination.normalizeOffset({
      page: query.page,
      limit: query.limit,
    });
    const result = await this.findAllUseCase.execute({ ...query, ...normalized });
    const page = this.unwrap(result);
    const built = this.pagination.buildResult(PharmacyMapper.toResponseList(page.items), {
      total: page.total,
      page: normalized.page,
      limit: normalized.limit,
    });
    return built;
  }

  public async update(id: string, dto: UpdatePharmacyDto) {
    const result = await this.updateUseCase.execute(id, dto);
    const entity = this.unwrap(result);
    this.events.emit(PHARMACY_EVENTS.UPDATED, new PharmacyUpdatedEvent(entity.getId()));
    return PharmacyMapper.toResponse(entity);
  }

  public async softDelete(id: string): Promise<void> {
    const result = await this.softDeleteUseCase.execute(id);
    this.unwrap(result);
    this.events.emit(PHARMACY_EVENTS.DELETED, new PharmacyDeletedEvent(id));
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
