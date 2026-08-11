/**
 * File: radiology.controller.ts
 * Module: radiology
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
import type { CreateRadiologyDto, RadiologyQueryDto, UpdateRadiologyDto } from './dto';
import { RadiologyService } from './radiology.service';

const RAD_READ = ['ADMIN', 'RADIOLOGIST', 'DOCTOR'] as const;
const RAD_WRITE = ['ADMIN', 'RADIOLOGIST', 'DOCTOR'] as const;

@ApiTags('Radiology')
@ApiBearerAuth()
@Controller('radiology')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RadiologyController {
  public constructor(private readonly service: RadiologyService) {}

  @Post()
  @Roles(...RAD_WRITE)
  @ApiOperation({ summary: 'Create radiology' })
  create(@Body() dto: CreateRadiologyDto) {
    return this.service.create(dto);
  }

  @Get()
  @Roles(...RAD_READ)
  @ApiOperation({ summary: 'List radiology (paginated)' })
  findAll(@Query() query: RadiologyQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Roles(...RAD_READ)
  @ApiOperation({ summary: 'Get radiology by id' })
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  @Roles(...RAD_WRITE)
  @ApiOperation({ summary: 'Update radiology' })
  update(@Param('id') id: string, @Body() dto: UpdateRadiologyDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Soft-delete radiology' })
  remove(@Param('id') id: string) {
    return this.service.softDelete(id);
  }
}
