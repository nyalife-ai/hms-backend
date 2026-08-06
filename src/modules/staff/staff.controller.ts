/**
 * File: staff.controller.ts
 * Module: staff
 * Purpose: HTTP controller with Swagger + pagination query.
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
// import { Public } from '../../common/decorators/public.decorator';
import type { CreateStaffDto, StaffQueryDto, UpdateStaffDto } from './dto';
import { StaffService } from './staff.service';

@ApiTags('Staff')
@Controller('staff')
export class StaffController {
  public constructor(private readonly service: StaffService) {}

  @Post()
  @ApiOperation({ summary: 'Create staff' })
  create(@Body() dto: CreateStaffDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List staff (paginated)' })
  // @Public()
  findAll(@Query() query: StaffQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get staff by id' })
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update staff' })
  update(@Param('id') id: string, @Body() dto: UpdateStaffDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete staff' })
  remove(@Param('id') id: string) {
    return this.service.softDelete(id);
  }
}
