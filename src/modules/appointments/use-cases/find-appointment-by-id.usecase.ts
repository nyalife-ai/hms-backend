/**
 * File: find-appointment-by-id.usecase.ts
 * Module: appointments
 * Purpose: Find appointment by id.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { APPOINTMENTS_REPOSITORY } from '../constants/appointments.constants';
import type { Appointment } from '../domain/appointment.entity';
import type { IAppointmentRepository } from '../interfaces/appointment-repository.interface';

@Injectable()
export class FindAppointmentByIdUseCase {
  public constructor(
    @Inject(APPOINTMENTS_REPOSITORY) private readonly repository: IAppointmentRepository,
  ) {}

  public async execute(id: string): Promise<Result<Appointment, NotFoundException>> {
    const entity = await this.repository.findById(id);
    if (!entity) {
      return Result.failure(new NotFoundException('Appointment', id));
    }
    return Result.success(entity);
  }
}
