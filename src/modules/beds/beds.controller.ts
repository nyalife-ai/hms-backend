/**
 * File: beds.controller.ts
 * Module: beds
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
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateBedDto, BedsQueryDto, UpdateBedDto } from './dto';
import { BedsService } from './beds.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { IpdJourneyUseCase } from '../inpatient/use-cases/ipd-journey.usecase';
import { IpdOperationsUseCase } from '../inpatient/use-cases/ipd-operations.usecase';

@ApiTags('Beds')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('beds')
export class BedsController {
  public constructor(
    private readonly service: BedsService,
    private readonly journey: IpdJourneyUseCase,
    private readonly ops: IpdOperationsUseCase,
  ) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Create bed (delegates to IPD — prefer POST /ipd/beds)',
  })
  create(@Body() dto: CreateBedDto) {
    return this.journey.createBed({
      wardId: dto.wardId,
      bedNumber: dto.name,
    });
  }

  @Get()
  @Roles('ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST')
  @ApiOperation({ summary: 'List beds (paginated scaffold read)' })
  findAll(@Query() query: BedsQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST')
  @ApiOperation({ summary: 'Get bed by id' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'NURSE')
  @ApiOperation({
    summary:
      'Update bed number via scaffold map, or status via IPD transition rules',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user?: { id?: string } },
    @Body() dto: UpdateBedDto & { status?: string },
  ) {
    if (dto.status) {
      return this.ops.updateBedStatus(id, dto.status, req.user?.id);
    }
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Decommission bed by moving to MAINTENANCE via IPD rules',
  })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.ops.updateBedStatus(id, 'MAINTENANCE', req.user?.id);
  }
}
