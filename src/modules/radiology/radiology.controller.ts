/**
 * File: radiology.controller.ts
 * Module: radiology
 * Purpose: HTTP controller with Swagger + pagination query.
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
// import { Public } from '../../common/decorators/public.decorator';
import type { CreateRadiologyDto, RadiologyQueryDto, UpdateRadiologyDto } from './dto';
import { RadiologyService } from './radiology.service';

@ApiTags('Radiology')
@Controller('radiology')
export class RadiologyController {
  public constructor(private readonly service: RadiologyService) {}

  @Post()
  @ApiOperation({ summary: 'Create radiology' })
  create(@Body() dto: CreateRadiologyDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List radiology (paginated)' })
  // @Public()
  findAll(@Query() query: RadiologyQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get radiology by id' })
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update radiology' })
  update(@Param('id') id: string, @Body() dto: UpdateRadiologyDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete radiology' })
  remove(@Param('id') id: string) {
    return this.service.softDelete(id);
  }
}
