/**
 * File: vital-signs.controller.ts
 * Module: vital-signs
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
import type { CreateVitalSignDto, VitalSignsQueryDto, UpdateVitalSignDto } from './dto';
import { VitalSignsService } from './vital-signs.service';

@ApiTags('VitalSigns')
@ApiBearerAuth()
@Controller('vital-signs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST')
export class VitalSignsController {
  public constructor(private readonly service: VitalSignsService) {}

  @Post()
  @ApiOperation({ summary: 'Create vital-sign' })
  create(@Body() dto: CreateVitalSignDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List vital-signs (paginated)' })
  findAll(@Query() query: VitalSignsQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get vital-sign by id' })
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update vital-sign' })
  update(@Param('id') id: string, @Body() dto: UpdateVitalSignDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Soft-delete vital-sign' })
  remove(@Param('id') id: string) {
    return this.service.softDelete(id);
  }
}
