/**
 * File: soft-delete-appointment.usecase.ts
 * Module: appointments
 * Purpose: Soft-delete appointment.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { APPOINTMENTS_REPOSITORY } from '../constants/appointments.constants';
import type { IAppointmentRepository } from '../interfaces/appointment-repository.interface';

@Injectable()
export class SoftDeleteAppointmentUseCase {
  public constructor(
    @Inject(APPOINTMENTS_REPOSITORY) private readonly repository: IAppointmentRepository,
  ) {}

  public async execute(id: string): Promise<Result<void, NotFoundException>> {
    if (!(await this.repository.exists(id))) {
      return Result.failure(new NotFoundException('Appointment', id));
    }
    await this.repository.softDelete(id);
    return Result.success(undefined);
  }
}
