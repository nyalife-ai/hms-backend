/**
 * File: create-appointment.usecase.ts
 * Module: appointments
 * Purpose: Create appointment use-case.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { CreateAppointmentDto } from '../dto';
import { Appointment } from '../domain/appointment.entity';
import { APPOINTMENTS_REPOSITORY } from '../constants/appointments.constants';
import type { IAppointmentRepository } from '../interfaces/appointment-repository.interface';

@Injectable()
export class CreateAppointmentUseCase {
  public constructor(
    @Inject(APPOINTMENTS_REPOSITORY)
    private readonly repository: IAppointmentRepository,
  ) {}

  public async execute(
    dto: CreateAppointmentDto,
  ): Promise<Result<Appointment, string>> {
    try {
      const entity = Appointment.create({
        name: dto.name,
        description: dto.description,
        patientId: dto.patientId,
        doctorId: dto.doctorId,
        appointmentDate: dto.appointmentDate,
        startTime: dto.startTime,
        endTime: dto.endTime,
        createdBy: dto.createdBy,
        status: dto.status,
        notes: dto.notes,
      });
      const saved = await this.repository.save(entity);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Create failed');
    }
  }
}
