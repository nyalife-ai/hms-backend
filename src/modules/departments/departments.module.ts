/**
 * File: departments.module.ts
 * Module: departments
 * Purpose: Nest module wiring repository factory and use-cases.
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { DEPARTMENTS_REPOSITORY } from './constants/departments.constants';
import { DepartmentsController } from './departments.controller';
import { DepartmentsService } from './departments.service';
import { DepartmentsListener } from './listeners/departments.listener';
import { DepartmentRepositoryProvider } from './repositories/departments.repository';
import { PrismaDepartmentRepository } from './repositories/prisma/prisma-department.repository';
import { CreateDepartmentUseCase } from './use-cases/create-department.usecase';
import { FindDepartmentByIdUseCase } from './use-cases/find-department-by-id.usecase';
import { FindAllDepartmentsUseCase } from './use-cases/find-all-departments.usecase';
import { UpdateDepartmentUseCase } from './use-cases/update-department.usecase';
import { SoftDeleteDepartmentUseCase } from './use-cases/soft-delete-department.usecase';

@Module({
  imports: [PrismaModule],
  controllers: [DepartmentsController],
  providers: [
    DepartmentsService,
    DepartmentsListener,
    DepartmentRepositoryProvider,
    PrismaDepartmentRepository,
    CreateDepartmentUseCase,
    FindDepartmentByIdUseCase,
    FindAllDepartmentsUseCase,
    UpdateDepartmentUseCase,
    SoftDeleteDepartmentUseCase,
  ],
  exports: [DepartmentsService, DEPARTMENTS_REPOSITORY],
})
export class DepartmentsModule {}
