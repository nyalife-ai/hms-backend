/**
 * File: appointments.module.ts
 * Module: appointments
 * Purpose: Nest module wiring repository factory and use-cases.
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { APPOINTMENTS_REPOSITORY } from './constants/appointments.constants';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { AppointmentsListener } from './listeners/appointments.listener';
import { AppointmentRepositoryProvider } from './repositories/appointments.repository';
import { PrismaAppointmentRepository } from './repositories/prisma/prisma-appointment.repository';
import { CreateAppointmentUseCase } from './use-cases/create-appointment.usecase';
import { FindAppointmentByIdUseCase } from './use-cases/find-appointment-by-id.usecase';
import { FindAllAppointmentsUseCase } from './use-cases/find-all-appointments.usecase';
import { UpdateAppointmentUseCase } from './use-cases/update-appointment.usecase';
import { SoftDeleteAppointmentUseCase } from './use-cases/soft-delete-appointment.usecase';

@Module({
  imports: [PrismaModule],
  controllers: [AppointmentsController],
  providers: [
    AppointmentsService,
    AppointmentsListener,
    AppointmentRepositoryProvider,
    PrismaAppointmentRepository,
    CreateAppointmentUseCase,
    FindAppointmentByIdUseCase,
    FindAllAppointmentsUseCase,
    UpdateAppointmentUseCase,
    SoftDeleteAppointmentUseCase,
  ],
  exports: [AppointmentsService, APPOINTMENTS_REPOSITORY],
})
export class AppointmentsModule {}
