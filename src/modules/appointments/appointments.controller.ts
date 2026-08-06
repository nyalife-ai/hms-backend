/**
 * File: appointments.controller.ts
 * Module: appointments
 * Purpose: HTTP controller with Swagger + pagination query.
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
// import { Public } from '../../common/decorators/public.decorator';
import type { CreateAppointmentDto, AppointmentsQueryDto, UpdateAppointmentDto } from './dto';
import { AppointmentsService } from './appointments.service';

@ApiTags('Appointments')
@Controller('appointments')
export class AppointmentsController {
  public constructor(private readonly service: AppointmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create appointment' })
  create(@Body() dto: CreateAppointmentDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List appointments (paginated)' })
  // @Public()
  findAll(@Query() query: AppointmentsQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get appointment by id' })
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update appointment' })
  update(@Param('id') id: string, @Body() dto: UpdateAppointmentDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete appointment' })
  remove(@Param('id') id: string) {
    return this.service.softDelete(id);
  }
}
