/**
 * File: diagnoses.controller.ts
 * Module: diagnoses
 * Purpose: HTTP controller with Swagger + pagination query.
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
// import { Public } from '../../common/decorators/public.decorator';
import type { CreateDiagnosDto, DiagnosesQueryDto, UpdateDiagnosDto } from './dto';
import { DiagnosesService } from './diagnoses.service';

@ApiTags('Diagnoses')
@Controller('diagnoses')
export class DiagnosesController {
  public constructor(private readonly service: DiagnosesService) {}

  @Post()
  @ApiOperation({ summary: 'Create diagnos' })
  create(@Body() dto: CreateDiagnosDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List diagnoses (paginated)' })
  // @Public()
  findAll(@Query() query: DiagnosesQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get diagnos by id' })
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update diagnos' })
  update(@Param('id') id: string, @Body() dto: UpdateDiagnosDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete diagnos' })
  remove(@Param('id') id: string) {
    return this.service.softDelete(id);
  }
}
