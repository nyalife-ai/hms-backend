/**
 * File: wards.controller.ts
 * Module: wards
 * Purpose: Compatibility routes that delegate writes to the IPD clinical API.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CreateWardDto, WardsQueryDto, UpdateWardDto } from './dto';
import { WardsService } from './wards.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { IpdJourneyUseCase } from '../inpatient/use-cases/ipd-journey.usecase';
import { IpdOperationsUseCase } from '../inpatient/use-cases/ipd-operations.usecase';

@ApiTags('Wards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('wards')
export class WardsController {
  public constructor(
    private readonly service: WardsService,
    private readonly journey: IpdJourneyUseCase,
    private readonly ops: IpdOperationsUseCase,
  ) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Create ward (delegates to IPD journey — prefer POST /ipd/wards)',
  })
  create(@Body() dto: CreateWardDto) {
    return this.journey.createWard({
      name: dto.name,
      wardType: dto.wardType,
      departmentId: dto.departmentId,
      dailyRate: dto.dailyRate,
      capacity: dto.capacity,
    });
  }

  @Get()
  @Roles('ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST')
  @ApiOperation({ summary: 'List wards (paginated scaffold read)' })
  findAll(@Query() query: WardsQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST')
  @ApiOperation({ summary: 'Get ward by id (IPD occupancy detail)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.getWard(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Update ward (delegates to IPD ops — prefer PATCH /ipd/wards/:id)',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWardDto,
  ) {
    return this.ops.updateWard(id, {
      name: dto.name,
      wardType: dto.wardType,
      departmentId: dto.departmentId,
      dailyRate: dto.dailyRate,
      capacity: dto.capacity,
    });
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Deactivate ward (delegates to IPD — prefer POST /ipd/wards/:id/deactivate)',
  })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.deactivateWard(id);
  }
}
