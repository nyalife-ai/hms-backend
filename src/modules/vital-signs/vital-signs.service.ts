/**
 * File: vital-signs.service.ts
 * Module: vital-signs
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
import type { CreateVitalSignDto, VitalSignsQueryDto, UpdateVitalSignDto } from './dto';
import { VitalSignMapper } from './mappers/vital-sign.mapper';
import { VITAL_SIGNS_EVENTS } from './constants/vital-signs.constants';
import { VitalSignCreatedEvent, VitalSignDeletedEvent, VitalSignUpdatedEvent } from './events';
import { CreateVitalSignUseCase } from './use-cases/create-vital-sign.usecase';
import { FindVitalSignByIdUseCase } from './use-cases/find-vital-sign-by-id.usecase';
import { FindAllVitalSignsUseCase } from './use-cases/find-all-vital-signs.usecase';
import { UpdateVitalSignUseCase } from './use-cases/update-vital-sign.usecase';
import { SoftDeleteVitalSignUseCase } from './use-cases/soft-delete-vital-sign.usecase';

@Injectable()
export class VitalSignsService {
  private readonly pagination = new PaginationService();

  public constructor(
    private readonly createUseCase: CreateVitalSignUseCase,
    private readonly findByIdUseCase: FindVitalSignByIdUseCase,
    private readonly findAllUseCase: FindAllVitalSignsUseCase,
    private readonly updateUseCase: UpdateVitalSignUseCase,
    private readonly softDeleteUseCase: SoftDeleteVitalSignUseCase,
    private readonly events: EventEmitter2,
  ) {}

  public async create(dto: CreateVitalSignDto) {
    const result = await this.createUseCase.execute(dto);
    const entity = this.unwrap(result);
    this.events.emit(VITAL_SIGNS_EVENTS.CREATED, new VitalSignCreatedEvent(entity.getId()));
    return VitalSignMapper.toResponse(entity);
  }

  public async findById(id: string) {
    const result = await this.findByIdUseCase.execute(id);
    return VitalSignMapper.toResponse(this.unwrap(result));
  }

  public async findAll(query: VitalSignsQueryDto) {
    const normalized = this.pagination.normalizeOffset({
      page: query.page,
      limit: query.limit,
    });
    const result = await this.findAllUseCase.execute({ ...query, ...normalized });
    const page = this.unwrap(result);
    const built = this.pagination.buildResult(VitalSignMapper.toResponseList(page.items), {
      total: page.total,
      page: normalized.page,
      limit: normalized.limit,
    });
    return built;
  }

  public async update(id: string, dto: UpdateVitalSignDto) {
    const result = await this.updateUseCase.execute(id, dto);
    const entity = this.unwrap(result);
    this.events.emit(VITAL_SIGNS_EVENTS.UPDATED, new VitalSignUpdatedEvent(entity.getId()));
    return VitalSignMapper.toResponse(entity);
  }

  public async softDelete(id: string): Promise<void> {
    const result = await this.softDeleteUseCase.execute(id);
    this.unwrap(result);
    this.events.emit(VITAL_SIGNS_EVENTS.DELETED, new VitalSignDeletedEvent(id));
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
