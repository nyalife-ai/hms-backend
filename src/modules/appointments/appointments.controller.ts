/**
 * File: appointments.controller.ts
 * Module: appointments
 * Purpose: HTTP controller with Swagger + pagination query.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  APPOINTMENT_READ_ROLES,
  FRONT_DESK_ROLES,
} from '../auth/role-sets';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type {
  CreateAppointmentDto,
  AppointmentsQueryDto,
  UpdateAppointmentDto,
} from './dto';
import { AppointmentsService } from './appointments.service';

@ApiTags('Appointments')
@ApiBearerAuth()
@Controller('appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppointmentsController {
  public constructor(private readonly service: AppointmentsService) {}

  @Post()
  @Roles(...FRONT_DESK_ROLES)
  @ApiOperation({ summary: 'Create appointment' })
  create(@Body() dto: CreateAppointmentDto) {
    return this.service.create(dto);
  }

  @Get()
  @Roles(...APPOINTMENT_READ_ROLES)
  @ApiOperation({ summary: 'List appointments (paginated)' })
  findAll(@Query() query: AppointmentsQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Roles(...APPOINTMENT_READ_ROLES)
  @ApiOperation({ summary: 'Get appointment by id' })
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  @Roles(...FRONT_DESK_ROLES)
  @ApiOperation({ summary: 'Update appointment' })
  update(@Param('id') id: string, @Body() dto: UpdateAppointmentDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Soft-delete appointment' })
  remove(@Param('id') id: string) {
    return this.service.softDelete(id);
  }
}
