/**
 * File: appointment-repository.interface.ts
 * Module: appointments
 * Purpose: Repository port (core Repository + pagination).
 */

import type { Repository } from '../../../core/contracts';
import type { Appointment } from '../domain/appointment.entity';
import type { AppointmentsQueryDto } from '../dto';

export type AppointmentPage = { items: Appointment[]; total: number };

export interface IAppointmentRepository extends Repository<Appointment, string> {
  findMany(query: AppointmentsQueryDto): Promise<AppointmentPage>;
  softDelete(id: string): Promise<void>;
}
