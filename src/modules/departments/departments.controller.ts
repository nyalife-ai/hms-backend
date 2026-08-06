/**
 * File: departments.controller.ts
 * Module: departments
 * Purpose: HTTP controller with Swagger + pagination query.
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
// import { Public } from '../../common/decorators/public.decorator';
import type { CreateDepartmentDto, DepartmentsQueryDto, UpdateDepartmentDto } from './dto';
import { DepartmentsService } from './departments.service';

@ApiTags('Departments')
@Controller('departments')
export class DepartmentsController {
  public constructor(private readonly service: DepartmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create department' })
  create(@Body() dto: CreateDepartmentDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List departments (paginated)' })
  // @Public()
  findAll(@Query() query: DepartmentsQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get department by id' })
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update department' })
  update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete department' })
  remove(@Param('id') id: string) {
    return this.service.softDelete(id);
  }
}
