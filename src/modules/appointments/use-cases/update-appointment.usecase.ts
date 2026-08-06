/**
 * File: update-appointment.usecase.ts
 * Module: appointments
 * Purpose: Update appointment.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import type { UpdateAppointmentDto } from '../dto';
import { APPOINTMENTS_REPOSITORY } from '../constants/appointments.constants';
import type { Appointment } from '../domain/appointment.entity';
import type { IAppointmentRepository } from '../interfaces/appointment-repository.interface';

@Injectable()
export class UpdateAppointmentUseCase {
  public constructor(
    @Inject(APPOINTMENTS_REPOSITORY)
    private readonly repository: IAppointmentRepository,
  ) {}

  public async execute(
    id: string,
    dto: UpdateAppointmentDto,
  ): Promise<Result<Appointment, NotFoundException | string>> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      return Result.failure(new NotFoundException('Appointment', id));
    }
    try {
      existing.update({
        name: dto.name,
        description: dto.description,
        appointmentDate: dto.appointmentDate,
        startTime: dto.startTime,
        endTime: dto.endTime,
        status: dto.status,
        notes: dto.notes,
      });
      const saved = await this.repository.save(existing);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Update failed');
    }
  }
}
