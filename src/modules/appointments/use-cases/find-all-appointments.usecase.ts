/**
 * File: find-all-appointments.usecase.ts
 * Module: appointments
 * Purpose: Paginated list of appointments.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { AppointmentsQueryDto } from '../dto';
import { APPOINTMENTS_REPOSITORY } from '../constants/appointments.constants';
import type { IAppointmentRepository, AppointmentPage } from '../interfaces/appointment-repository.interface';

@Injectable()
export class FindAllAppointmentsUseCase {
  public constructor(
    @Inject(APPOINTMENTS_REPOSITORY) private readonly repository: IAppointmentRepository,
  ) {}

  public async execute(query: AppointmentsQueryDto): Promise<Result<AppointmentPage, string>> {
    try {
      const page = await this.repository.findMany(query);
      return Result.success(page);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'List failed');
    }
  }
}
