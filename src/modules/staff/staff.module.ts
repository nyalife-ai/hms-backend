/**
 * File: staff.module.ts
 * Module: staff
 * Purpose: Nest module wiring repository factory and use-cases.
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { STAFF_REPOSITORY } from './constants/staff.constants';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { StaffListener } from './listeners/staff.listener';
import { StaffRepositoryProvider } from './repositories/staff.repository';
import { PrismaStaffRepository } from './repositories/prisma/prisma-staff.repository';
import { CreateStaffUseCase } from './use-cases/create-staff.usecase';
import { FindStaffByIdUseCase } from './use-cases/find-staff-by-id.usecase';
import { FindAllStaffUseCase } from './use-cases/find-all-staff.usecase';
import { UpdateStaffUseCase } from './use-cases/update-staff.usecase';
import { SoftDeleteStaffUseCase } from './use-cases/soft-delete-staff.usecase';

@Module({
  imports: [PrismaModule],
  controllers: [StaffController],
  providers: [
    StaffService,
    StaffListener,
    StaffRepositoryProvider,
    PrismaStaffRepository,
    CreateStaffUseCase,
    FindStaffByIdUseCase,
    FindAllStaffUseCase,
    UpdateStaffUseCase,
    SoftDeleteStaffUseCase,
  ],
  exports: [StaffService, STAFF_REPOSITORY],
})
export class StaffModule {}
