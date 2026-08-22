/**
 * Application service — appointments CRUD + lifecycle milestones.
 * Emits ID-centric domain envelopes for the notification policy layer.
 */

import {
  ConflictException,
  Injectable,
  NotFoundException as HttpNotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../database/prisma/prisma.service';
import { Result } from '../../core/contracts';
import { createDomainEventId } from '../../core/domain';
import {
  BaseApplicationException,
  NotFoundException,
} from '../../core/exceptions';
import { PaginationService } from '../../platform/api/pagination/pagination.service';
import type {
  CreateAppointmentDto,
  AppointmentsQueryDto,
  UpdateAppointmentDto,
  CancelAppointmentDto,
  CheckInAppointmentDto,
  RescheduleAppointmentDto,
} from './dto';
import { AppointmentMapper } from './mappers/appointment.mapper';
import { APPOINTMENTS_EVENTS } from './constants/appointments.constants';
import {
  AppointmentCreatedEvent,
  AppointmentDeletedEvent,
  AppointmentUpdatedEvent,
} from './events';
import { APPOINTMENT_DOMAIN_EVENTS } from './events/appointment-domain.events';
import type { Appointment } from './domain/appointment.entity';
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
    private readonly prisma: PrismaService,
  ) {}

  public async create(dto: CreateAppointmentDto) {
    const result = await this.createUseCase.execute(dto);
    const entity = this.unwrap(result);
    this.events.emit(
      APPOINTMENTS_EVENTS.CREATED,
      new AppointmentCreatedEvent(entity.getId()),
    );
    await this.emitDomain(APPOINTMENT_DOMAIN_EVENTS.CREATED, {
      appointmentId: entity.getId(),
      patientId: entity.getPatientId(),
      doctorId: entity.getDoctorId(),
      startsAt: combineStartsAt(entity),
    });
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
    const result = await this.findAllUseCase.execute({
      ...query,
      ...normalized,
    });
    const page = this.unwrap(result);
    return this.pagination.buildResult(
      AppointmentMapper.toResponseList(page.items),
      {
        total: page.total,
        page: normalized.page,
        limit: normalized.limit,
      },
    );
  }

  public async update(id: string, dto: UpdateAppointmentDto) {
    const result = await this.updateUseCase.execute(id, dto);
    const entity = this.unwrap(result);
    this.events.emit(
      APPOINTMENTS_EVENTS.UPDATED,
      new AppointmentUpdatedEvent(entity.getId()),
    );
    return AppointmentMapper.toResponse(entity);
  }

  public async softDelete(id: string): Promise<void> {
    const result = await this.softDeleteUseCase.execute(id);
    this.unwrap(result);
    this.events.emit(
      APPOINTMENTS_EVENTS.DELETED,
      new AppointmentDeletedEvent(id),
    );
  }

  public async cancel(id: string, _dto: CancelAppointmentDto) {
    const existing = this.unwrap(await this.findByIdUseCase.execute(id));
    const result = await this.updateUseCase.execute(id, {
      status: 'CANCELLED',
    });
    const entity = this.unwrap(result);
    await this.emitDomain(APPOINTMENT_DOMAIN_EVENTS.CANCELLED, {
      appointmentId: entity.getId(),
      patientId: entity.getPatientId(),
      doctorId: entity.getDoctorId(),
      appointmentDate: combineStartsAt(existing),
    });
    return AppointmentMapper.toResponse(entity);
  }

  public async checkIn(id: string, _dto: CheckInAppointmentDto) {
    const result = await this.updateUseCase.execute(id, {
      status: 'CHECKED_IN',
    });
    const entity = this.unwrap(result);
    await this.emitDomain(APPOINTMENT_DOMAIN_EVENTS.CHECKED_IN, {
      appointmentId: entity.getId(),
      patientId: entity.getPatientId(),
      doctorId: entity.getDoctorId(),
    });
    return AppointmentMapper.toResponse(entity);
  }

  public async reschedule(id: string, dto: RescheduleAppointmentDto) {
    const result = await this.updateUseCase.execute(id, {
      appointmentDate: dto.appointmentDate,
      startTime: dto.startTime,
      endTime: dto.endTime,
      notes: dto.notes,
      status: 'SCHEDULED',
    });
    const entity = this.unwrap(result);
    await this.emitDomain(APPOINTMENT_DOMAIN_EVENTS.RESCHEDULED, {
      appointmentId: entity.getId(),
      patientId: entity.getPatientId(),
      doctorId: entity.getDoctorId(),
      startsAt: combineStartsAt(entity),
    });
    return AppointmentMapper.toResponse(entity);
  }

  private async emitDomain(
    type: string,
    payload: Record<string, string | undefined>,
  ): Promise<void> {
    const doctorId = payload.doctorId;
    let doctorUserId = payload.doctorUserId;
    if (doctorId && !doctorUserId) {
      const staff = await this.prisma.staffProfiles.findFirst({
        where: { id: doctorId, deleted_at: null },
        select: { user_id: true },
      });
      doctorUserId = staff?.user_id;
    }
    const envelope = {
      id: createDomainEventId(),
      type,
      occurredAt: new Date().toISOString(),
      payload: { ...payload, doctorUserId },
    };
    this.events.emit(type, envelope);
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

function combineStartsAt(entity: Appointment): string {
  const date = entity.getAppointmentDate();
  const time = entity.getStartTime();
  const combined = new Date(date);
  combined.setHours(time.getHours(), time.getMinutes(), time.getSeconds(), 0);
  return combined.toISOString();
}
