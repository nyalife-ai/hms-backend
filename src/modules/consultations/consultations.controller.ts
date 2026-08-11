/**
 * File: consultations.controller.ts
 * Module: consultations
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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { CreateConsultationDto, ConsultationsQueryDto, UpdateConsultationDto } from './dto';
import { ConsultationsService } from './consultations.service';

@ApiTags('Consultations')
@ApiBearerAuth()
@Controller('consultations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'DOCTOR')
export class ConsultationsController {
  public constructor(private readonly service: ConsultationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create Consultation' })
  create(@Body() dto: CreateConsultationDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List consultations (paginated)' })
  findAll(@Query() query: ConsultationsQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get Consultation by id' })
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update Consultation' })
  update(@Param('id') id: string, @Body() dto: UpdateConsultationDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Soft-delete Consultation' })
  remove(@Param('id') id: string) {
    return this.service.softDelete(id);
  }
}
