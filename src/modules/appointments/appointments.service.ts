/**
 * File: appointments.service.ts
 * Module: appointments
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
import type { CreateAppointmentDto, AppointmentsQueryDto, UpdateAppointmentDto } from './dto';
import { AppointmentMapper } from './mappers/appointment.mapper';
import { APPOINTMENTS_EVENTS } from './constants/appointments.constants';
import { AppointmentCreatedEvent, AppointmentDeletedEvent, AppointmentUpdatedEvent } from './events';
import { CreateAppointmentUseCase } from './use-cases/create-appointment.usecase';
import { FindAppointmentByIdUseCase } from './use-cases/find-appointment-by-id.usecase';
import { FindAllAppointmentsUseCase } from './use-cases/find-all-appointments.usecase';
import { UpdateAppointmentUseCase } from './use-cases/update-appointment.usecase';
import { SoftDeleteAppointmentUseCase } from './use-cases/soft-delete-appointment.usecase';

@Injectable()
export class AppointmentsService {
  private readonly pagination = new PaginationService();

  public constructor(
    private readonly createUseCase: CreateAppointmentUseCase,
    private readonly findByIdUseCase: FindAppointmentByIdUseCase,
    private readonly findAllUseCase: FindAllAppointmentsUseCase,
    private readonly updateUseCase: UpdateAppointmentUseCase,
    private readonly softDeleteUseCase: SoftDeleteAppointmentUseCase,
    private readonly events: EventEmitter2,
  ) {}

  public async create(dto: CreateAppointmentDto) {
    const result = await this.createUseCase.execute(dto);
    const entity = this.unwrap(result);
    this.events.emit(APPOINTMENTS_EVENTS.CREATED, new AppointmentCreatedEvent(entity.getId()));
    return AppointmentMapper.toResponse(entity);
  }

  public async findById(id: string) {
    const result = await this.findByIdUseCase.execute(id);
    return AppointmentMapper.toResponse(this.unwrap(result));
  }

  public async findAll(query: AppointmentsQueryDto) {
    const normalized = this.pagination.normalizeOffset({
      page: query.page,
      limit: query.limit,
    });
    const result = await this.findAllUseCase.execute({ ...query, ...normalized });
    const page = this.unwrap(result);
    const built = this.pagination.buildResult(AppointmentMapper.toResponseList(page.items), {
      total: page.total,
      page: normalized.page,
      limit: normalized.limit,
    });
    return built;
  }

  public async update(id: string, dto: UpdateAppointmentDto) {
    const result = await this.updateUseCase.execute(id, dto);
    const entity = this.unwrap(result);
    this.events.emit(APPOINTMENTS_EVENTS.UPDATED, new AppointmentUpdatedEvent(entity.getId()));
    return AppointmentMapper.toResponse(entity);
  }

  public async softDelete(id: string): Promise<void> {
    const result = await this.softDeleteUseCase.execute(id);
    this.unwrap(result);
    this.events.emit(APPOINTMENTS_EVENTS.DELETED, new AppointmentDeletedEvent(id));
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
