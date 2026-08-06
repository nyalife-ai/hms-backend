/**
 * File: consultations.controller.ts
 * Module: consultations
 * Purpose: HTTP controller with Swagger + pagination query.
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
// import { Public } from '../../common/decorators/public.decorator';
import type { CreateConsultationDto, ConsultationsQueryDto, UpdateConsultationDto } from './dto';
import { ConsultationsService } from './consultations.service';

@ApiTags('Consultations')
@Controller('consultations')
export class ConsultationsController {
  public constructor(private readonly service: ConsultationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create consultation' })
  create(@Body() dto: CreateConsultationDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List consultations (paginated)' })
  // @Public()
  findAll(@Query() query: ConsultationsQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get consultation by id' })
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update consultation' })
  update(@Param('id') id: string, @Body() dto: UpdateConsultationDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete consultation' })
  remove(@Param('id') id: string) {
    return this.service.softDelete(id);
  }
}
