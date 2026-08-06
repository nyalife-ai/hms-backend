/**
 * File: patients.service.ts
 * Module: patients
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
import type { CreatePatientDto, PatientsQueryDto, UpdatePatientDto } from './dto';
import { PatientMapper } from './mappers/patient.mapper';
import { PATIENTS_EVENTS } from './constants/patients.constants';
import { PatientCreatedEvent, PatientDeletedEvent, PatientUpdatedEvent } from './events';
import { CreatePatientUseCase } from './use-cases/create-patient.usecase';
import { FindPatientByIdUseCase } from './use-cases/find-patient-by-id.usecase';
import { FindAllPatientsUseCase } from './use-cases/find-all-patients.usecase';
import { UpdatePatientUseCase } from './use-cases/update-patient.usecase';
import { SoftDeletePatientUseCase } from './use-cases/soft-delete-patient.usecase';

@Injectable()
export class PatientsService {
  private readonly pagination = new PaginationService();

  public constructor(
    private readonly createUseCase: CreatePatientUseCase,
    private readonly findByIdUseCase: FindPatientByIdUseCase,
    private readonly findAllUseCase: FindAllPatientsUseCase,
    private readonly updateUseCase: UpdatePatientUseCase,
    private readonly softDeleteUseCase: SoftDeletePatientUseCase,
    private readonly events: EventEmitter2,
  ) {}

  public async create(dto: CreatePatientDto) {
    const result = await this.createUseCase.execute(dto);
    const entity = this.unwrap(result);
    this.events.emit(PATIENTS_EVENTS.CREATED, new PatientCreatedEvent(entity.getId()));
    return PatientMapper.toResponse(entity);
  }

  public async findById(id: string) {
    const result = await this.findByIdUseCase.execute(id);
    return PatientMapper.toResponse(this.unwrap(result));
  }

  public async findAll(query: PatientsQueryDto) {
    const normalized = this.pagination.normalizeOffset({
      page: query.page,
      limit: query.limit,
    });
    const result = await this.findAllUseCase.execute({ ...query, ...normalized });
    const page = this.unwrap(result);
    const built = this.pagination.buildResult(PatientMapper.toResponseList(page.items), {
      total: page.total,
      page: normalized.page,
      limit: normalized.limit,
    });
    return built;
  }

  public async update(id: string, dto: UpdatePatientDto) {
    const result = await this.updateUseCase.execute(id, dto);
    const entity = this.unwrap(result);
    this.events.emit(PATIENTS_EVENTS.UPDATED, new PatientUpdatedEvent(entity.getId()));
    return PatientMapper.toResponse(entity);
  }

  public async softDelete(id: string): Promise<void> {
    const result = await this.softDeleteUseCase.execute(id);
    this.unwrap(result);
    this.events.emit(PATIENTS_EVENTS.DELETED, new PatientDeletedEvent(id));
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
